/**
 * character.service.ts — repository + orchestration for `user_class_state`.
 *
 * State writes happen inside transactions with `SELECT ... FOR UPDATE` to
 * serialize concurrent session pushes from multiple devices. Pure progression
 * logic lives in `classProgression.service.ts`.
 */

import type { PoolClient } from 'pg';

import pool from '../db/pool';
import type { ClassTierStage, UserClassState } from '../models/UserClassState';
import { logger } from '../utils/logger';
import { writeAuditEvent } from './audit.service';
import {
  canChooseLegendary,
  canChooseSpecialization,
  canChooseVocation,
  evaluateProgression,
  type StatLevels,
} from './classProgression.service';

export class ChoiceConflictError extends Error {
  readonly code = 'CHARACTER_CHOICE_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ChoiceConflictError';
  }
}

export class ChoiceValidationError extends Error {
  readonly code = 'CHARACTER_CHOICE_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'ChoiceValidationError';
  }
}

interface UpdateClassStateInput {
  current_tier?: number;
  vocation_class_id?: string | null;
  specialization_class_id?: string | null;
  legendary_class_id?: string | null;
  legendary_stage?: ClassTierStage | null;
  is_maestro_supremo?: boolean;
  is_leyenda?: boolean;
  pending_choice_tier?: number | null;
}

// Allowlist of writable columns. Constraining the dynamic UPDATE builder
// against a static set means a future bug or input-confusion can never
// interpolate an attacker-controlled column name into raw SQL.
const WRITABLE_COLUMNS: ReadonlySet<keyof UpdateClassStateInput> = new Set([
  'current_tier',
  'vocation_class_id',
  'specialization_class_id',
  'legendary_class_id',
  'legendary_stage',
  'is_maestro_supremo',
  'is_leyenda',
  'pending_choice_tier',
]);

export const findByUserId = async (
  userId: number
): Promise<UserClassState | null> => {
  const result = await pool.query<UserClassState>(
    'SELECT * FROM user_class_state WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
};

const ensureRow = async (
  client: PoolClient,
  userId: number
): Promise<UserClassState> => {
  // ON CONFLICT DO NOTHING + RETURNING gives us either the freshly inserted
  // row or no row (if it existed). The fallback SELECT covers the latter case.
  const inserted = await client.query<UserClassState>(
    `INSERT INTO user_class_state (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING *`,
    [userId]
  );
  if (inserted.rows[0]) return inserted.rows[0];

  const existing = await client.query<UserClassState>(
    'SELECT * FROM user_class_state WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  if (!existing.rows[0]) {
    throw new Error(`Failed to fetch user_class_state for user ${userId}`);
  }
  return existing.rows[0];
};

const lockRow = async (
  client: PoolClient,
  userId: number
): Promise<UserClassState> => {
  const result = await client.query<UserClassState>(
    'SELECT * FROM user_class_state WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  if (result.rows[0]) return result.rows[0];
  // Lazy-create + lock on first encounter.
  return ensureRow(client, userId);
};

const buildUpdateClause = (
  data: UpdateClassStateInput
): { setClause: string; values: unknown[] } => {
  const fields = (Object.keys(data) as (keyof UpdateClassStateInput)[]).filter(
    (key) => WRITABLE_COLUMNS.has(key) && data[key] !== undefined
  );
  if (fields.length === 0) {
    return { setClause: '', values: [] };
  }
  const values = fields.map((field) => data[field]);
  const setClause = fields
    .map((field, index) => `${field} = $${index + 1}`)
    .join(', ');
  return { setClause, values };
};

const writeRow = async (
  client: PoolClient,
  userId: number,
  data: UpdateClassStateInput
): Promise<UserClassState> => {
  const { setClause, values } = buildUpdateClause(data);
  if (!setClause) {
    const current = await client.query<UserClassState>(
      'SELECT * FROM user_class_state WHERE user_id = $1',
      [userId]
    );
    if (!current.rows[0]) {
      throw new Error(`No user_class_state for user ${userId}`);
    }
    return current.rows[0];
  }

  const result = await client.query<UserClassState>(
    `UPDATE user_class_state
        SET ${setClause}, updated_at = NOW()
      WHERE user_id = $${values.length + 1}
    RETURNING *`,
    [...values, userId]
  );
  if (!result.rows[0]) {
    throw new Error(`No user_class_state for user ${userId}`);
  }
  return result.rows[0];
};

/** Lazy-loads or creates the user's class state. Read-only path. */
export const findOrCreateByUserId = async (
  userId: number
): Promise<UserClassState> => {
  const existing = await findByUserId(userId);
  if (existing) return existing;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await ensureRow(client, userId);
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const buildAutoUpgradeUpdates = (
  state: UserClassState,
  upgrades: number[]
): UpdateClassStateInput => {
  const updates: UpdateClassStateInput = {};
  let nextTier = state.current_tier;

  for (const tier of upgrades) {
    if (
      tier === 4 &&
      state.legendary_class_id &&
      state.legendary_stage !== 'TRANSCENDENT'
    ) {
      updates.legendary_stage = 'TRANSCENDENT';
      nextTier = Math.max(nextTier, 4);
    }
    if (tier === 5 && !state.is_maestro_supremo) {
      updates.is_maestro_supremo = true;
      nextTier = Math.max(nextTier, 5);
    }
    if (tier === 6 && !state.is_leyenda) {
      updates.is_leyenda = true;
      nextTier = Math.max(nextTier, 6);
    }
  }

  if (nextTier !== state.current_tier) {
    updates.current_tier = nextTier;
  }
  return updates;
};

const auditAutoPromotions = async (
  userId: number,
  fromTier: number,
  toTier: number,
  promotedTiers: number[]
): Promise<void> => {
  if (promotedTiers.length === 0) return;
  try {
    await writeAuditEvent({
      action: 'CHARACTER_TIER_AUTO_PROMOTED',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { fromTier, toTier, promotedTiers },
    });
  } catch (err) {
    // Audit is best-effort; never fail the user-facing operation.
    logger.warn(
      { err, userId, promotedTiers },
      'Failed to write CHARACTER_TIER_AUTO_PROMOTED audit event'
    );
  }
};

export interface ProgressionResult {
  state: UserClassState;
  promotedTiers: number[];
}

/**
 * Evaluates the user's stats against their class state and applies any
 * automatic tier upgrades (T4 Transcendent, T5 Maestro Supremo, T6 Leyenda).
 * Choice tiers (T1, T2, T3) are surfaced via `pending_choice_tier`.
 *
 * Wraps the read-modify-write cycle in a transaction with `SELECT FOR UPDATE`
 * so concurrent session writes from the same user serialize correctly.
 *
 * Idempotent: calling with unchanged stats produces no row update.
 */
export const evaluateAfterStatsUpdate = async (
  userId: number,
  stats: StatLevels
): Promise<ProgressionResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const state = await lockRow(client, userId);

    const evaluation = evaluateProgression(stats, {
      current_tier: state.current_tier,
      vocation_class_id: state.vocation_class_id,
      specialization_class_id: state.specialization_class_id,
      legendary_class_id: state.legendary_class_id,
    });

    const updates: UpdateClassStateInput = buildAutoUpgradeUpdates(
      state,
      evaluation.autoTierUpgrades
    );

    if (
      evaluation.pendingChoiceTier !== null &&
      state.pending_choice_tier !== evaluation.pendingChoiceTier
    ) {
      updates.pending_choice_tier = evaluation.pendingChoiceTier;
    }

    const next = await writeRow(client, userId, updates);
    await client.query('COMMIT');

    await auditAutoPromotions(
      userId,
      state.current_tier,
      next.current_tier,
      evaluation.autoTierUpgrades
    );

    return { state: next, promotedTiers: evaluation.autoTierUpgrades };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const validateChoiceForTier = (
  tier: 1 | 2 | 3,
  classId: string,
  state: UserClassState
): boolean => {
  if (tier === 1) return canChooseVocation(classId);
  if (tier === 2) {
    if (!state.vocation_class_id) return false;
    return canChooseSpecialization(classId, state.vocation_class_id);
  }
  if (!state.specialization_class_id) return false;
  return canChooseLegendary(classId, state.specialization_class_id);
};

/**
 * Persists the user's choice at a tier-up modal and immediately re-evaluates
 * progression so chained tier-ups (T1 → T2 already met, T3 → T4 auto, etc.)
 * apply in a single transaction. The whole choice + re-evaluation is one
 * `BEGIN`/`COMMIT` block with `SELECT FOR UPDATE` to serialize concurrent
 * `POST /character/choose` calls from the same user.
 *
 * Re-validates inside the transaction even though the controller checks too
 * (defense in depth — the service is the security boundary).
 */
export const applyChoice = async (
  userId: number,
  tier: 1 | 2 | 3,
  classId: string,
  stats: StatLevels
): Promise<ProgressionResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const state = await lockRow(client, userId);

    if (state.pending_choice_tier !== tier) {
      throw new ChoiceConflictError(`No pending choice at tier ${tier}`);
    }
    if (!validateChoiceForTier(tier, classId, state)) {
      throw new ChoiceValidationError(
        `classId "${classId}" is not valid for tier ${tier}`
      );
    }

    const choiceUpdates: UpdateClassStateInput = { pending_choice_tier: null };
    if (tier === 1) {
      choiceUpdates.vocation_class_id = classId;
      choiceUpdates.current_tier = Math.max(state.current_tier, 1);
    } else if (tier === 2) {
      choiceUpdates.specialization_class_id = classId;
      choiceUpdates.current_tier = Math.max(state.current_tier, 2);
    } else {
      choiceUpdates.legendary_class_id = classId;
      choiceUpdates.current_tier = Math.max(state.current_tier, 3);
      // Picking a legendary establishes the "normal" form; auto upgrade to
      // TRANSCENDENT happens later when the T4 gate is met.
      choiceUpdates.legendary_stage = 'NORMAL';
    }

    const intermediate = await writeRow(client, userId, choiceUpdates);

    // Re-evaluate so the next pending tier (or auto upgrade) lands in the same
    // transaction as the choice itself.
    const evaluation = evaluateProgression(stats, {
      current_tier: intermediate.current_tier,
      vocation_class_id: intermediate.vocation_class_id,
      specialization_class_id: intermediate.specialization_class_id,
      legendary_class_id: intermediate.legendary_class_id,
    });

    const followups: UpdateClassStateInput = buildAutoUpgradeUpdates(
      intermediate,
      evaluation.autoTierUpgrades
    );
    if (evaluation.pendingChoiceTier !== null) {
      followups.pending_choice_tier = evaluation.pendingChoiceTier;
    }

    const final =
      Object.keys(followups).length > 0
        ? await writeRow(client, userId, followups)
        : intermediate;

    await client.query('COMMIT');

    await auditAutoPromotions(
      userId,
      state.current_tier,
      final.current_tier,
      evaluation.autoTierUpgrades
    );

    return { state: final, promotedTiers: evaluation.autoTierUpgrades };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
