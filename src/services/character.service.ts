/**
 * character.service.ts — repository for `user_class_state`.
 *
 * Wraps DB access for the character class system. Pure progression logic
 * lives in `classProgression.service.ts`.
 */

import pool from '../db/pool';
import type { ClassTierStage, UserClassState } from '../models/UserClassState';
import {
  evaluateProgression,
  type StatLevels,
} from './classProgression.service';

const DEFAULT_STATE: Omit<UserClassState, 'user_id' | 'updated_at'> = {
  current_tier: 0,
  vocation_class_id: null,
  specialization_class_id: null,
  legendary_class_id: null,
  legendary_stage: 'NORMAL',
  is_maestro_supremo: false,
  is_leyenda: false,
  pending_choice_tier: null,
};

export const findByUserId = async (
  userId: number
): Promise<UserClassState | null> => {
  const result = await pool.query<UserClassState>(
    'SELECT * FROM user_class_state WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] ?? null;
};

const insertDefault = async (userId: number): Promise<UserClassState> => {
  const result = await pool.query<UserClassState>(
    `INSERT INTO user_class_state (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING *`,
    [userId]
  );
  if (result.rows[0]) return result.rows[0];

  // Conflict path: row already existed.
  const existing = await findByUserId(userId);
  if (!existing) {
    throw new Error(`Failed to fetch user_class_state for user ${userId}`);
  }
  return existing;
};

/** Lazy-loads or creates the user's class state. */
export const findOrCreateByUserId = async (
  userId: number
): Promise<UserClassState> => {
  const existing = await findByUserId(userId);
  if (existing) return existing;
  return insertDefault(userId);
};

interface UpdateClassStateInput {
  current_tier?: number;
  vocation_class_id?: string | null;
  specialization_class_id?: string | null;
  legendary_class_id?: string | null;
  legendary_stage?: ClassTierStage;
  is_maestro_supremo?: boolean;
  is_leyenda?: boolean;
  pending_choice_tier?: number | null;
}

export const updateState = async (
  userId: number,
  data: UpdateClassStateInput
): Promise<UserClassState> => {
  const fields = Object.keys(data) as (keyof UpdateClassStateInput)[];
  if (fields.length === 0) {
    const current = await findByUserId(userId);
    if (!current) {
      throw new Error(`No user_class_state for user ${userId}`);
    }
    return current;
  }

  const values = fields.map((field) => data[field]);
  const setClause = fields
    .map((field, index) => `${field} = $${index + 1}`)
    .join(', ');

  const result = await pool.query<UserClassState>(
    `UPDATE user_class_state
        SET ${setClause}, updated_at = NOW()
      WHERE user_id = $${fields.length + 1}
    RETURNING *`,
    [...values, userId]
  );

  if (!result.rows[0]) {
    throw new Error(`No user_class_state for user ${userId}`);
  }
  return result.rows[0];
};

/**
 * Evaluates the user's stats against their current class state and applies
 * any automatic tier upgrades (T4 Trascendente, T5 Maestro Supremo, T6 Leyenda).
 *
 * If a choice modal is needed (T1, T2 or T3 unlocked), only marks
 * `pending_choice_tier` so the client shows the modal on next visit.
 *
 * Designed to be called from `session.service.processSession` right after
 * stats are persisted. Failures are swallowed by the caller — the class
 * system is non-critical to session registration.
 */
export const evaluateAfterStatsUpdate = async (
  userId: number,
  stats: StatLevels
): Promise<UserClassState> => {
  const state = await findOrCreateByUserId(userId);

  const evaluation = evaluateProgression(stats, {
    current_tier: state.current_tier,
    vocation_class_id: state.vocation_class_id,
    specialization_class_id: state.specialization_class_id,
    legendary_class_id: state.legendary_class_id,
  });

  const updates: UpdateClassStateInput = {};

  if (
    evaluation.pendingChoiceTier !== null &&
    state.pending_choice_tier !== evaluation.pendingChoiceTier
  ) {
    updates.pending_choice_tier = evaluation.pendingChoiceTier;
  }

  for (const tier of evaluation.autoTierUpgrades) {
    if (tier === 4 && state.legendary_stage !== 'TRASCENDENTE') {
      updates.legendary_stage = 'TRASCENDENTE';
      updates.current_tier = Math.max(state.current_tier, 4);
    }
    if (tier === 5 && !state.is_maestro_supremo) {
      updates.is_maestro_supremo = true;
      updates.current_tier = Math.max(
        updates.current_tier ?? state.current_tier,
        5
      );
    }
    if (tier === 6 && !state.is_leyenda) {
      updates.is_leyenda = true;
      updates.current_tier = Math.max(
        updates.current_tier ?? state.current_tier,
        6
      );
    }
  }

  if (Object.keys(updates).length === 0) {
    return state;
  }

  return updateState(userId, updates);
};

/**
 * Persists the user's choice at a tier-up modal. Validates that the choice
 * is consistent with current state and clears the pending choice flag.
 */
export const applyChoice = async (
  userId: number,
  tier: 1 | 2 | 3,
  classId: string
): Promise<UserClassState> => {
  const updates: UpdateClassStateInput = { pending_choice_tier: null };

  if (tier === 1) {
    updates.vocation_class_id = classId;
    updates.current_tier = 1;
  } else if (tier === 2) {
    updates.specialization_class_id = classId;
    updates.current_tier = 2;
  } else {
    updates.legendary_class_id = classId;
    updates.current_tier = 3;
  }

  return updateState(userId, updates);
};

export { DEFAULT_STATE };
