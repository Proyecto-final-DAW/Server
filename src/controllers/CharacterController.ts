import { Response } from 'express';

import {
  LEGENDARIES,
  NOVICE,
  SPECIALIZATIONS,
  VOCATIONS,
  findLegendary,
  findSpecialization,
  findVocation,
} from '../data/classes';
import type { UserClassState } from '../models/UserClassState';
import * as characterService from '../services/character.service';
import {
  ChoiceConflictError,
  ChoiceValidationError,
} from '../services/character.service';
import {
  availableLegendaries,
  availableSpecializations,
  heroLevel,
  recommendedLegendary,
  recommendedSpecialization,
  recommendedVocation,
  type StatLevels,
} from '../services/classProgression.service';
import * as statsService from '../services/stats.service';
import { safeWriteAuditEvent } from '../utils/audit';
import { sendServerError } from '../utils/httpError';
import type { ChooseClassBody } from '../validators/character';
import { AuthRequest } from './UserController';

// The `stats` table stores both per-stat XP (column `strength`, 0–99 within
// the current level) and the lifetime LEVEL (column `strength_level`, 1–99).
// The progression gates in classProgression.service expect levels.
// `session.service.processSession` already reads `_level` columns; this
// matches that contract.
const toStatLevels = (row: Record<string, unknown>): StatLevels => ({
  strength: Number(row.strength_level ?? 0),
  endurance: Number(row.endurance_level ?? 0),
  stamina: Number(row.stamina_level ?? 0),
  agility: Number(row.agility_level ?? 0),
  tenacity: Number(row.tenacity_level ?? 0),
  vigor: Number(row.vigor_level ?? 0),
});

const buildPendingChoice = (state: UserClassState, stats: StatLevels) => {
  if (state.pending_choice_tier === null) return null;

  if (state.pending_choice_tier === 1) {
    return {
      tier: 1 as const,
      options: [...VOCATIONS],
      recommendedId: recommendedVocation(stats).id,
    };
  }

  if (state.pending_choice_tier === 2 && state.vocation_class_id) {
    const vocation = findVocation(state.vocation_class_id);
    if (!vocation) return null;
    return {
      tier: 2 as const,
      options: availableSpecializations(vocation.id),
      recommendedId: recommendedSpecialization(stats, vocation.id).id,
    };
  }

  if (state.pending_choice_tier === 3 && state.specialization_class_id) {
    const spec = findSpecialization(state.specialization_class_id);
    if (!spec) return null;
    return {
      tier: 3 as const,
      options: availableLegendaries(spec.id),
      recommendedId: recommendedLegendary(stats, spec.id).id,
    };
  }

  return null;
};

const serializeState = (state: UserClassState, stats: StatLevels) => ({
  currentTier: state.current_tier,
  heroLevel: heroLevel(stats),
  novice: NOVICE,
  vocation: state.vocation_class_id
    ? (findVocation(state.vocation_class_id) ?? null)
    : null,
  specialization: state.specialization_class_id
    ? (findSpecialization(state.specialization_class_id) ?? null)
    : null,
  legendary: state.legendary_class_id
    ? (findLegendary(state.legendary_class_id) ?? null)
    : null,
  legendaryStage: state.legendary_stage,
  isMaestroSupremo: state.is_maestro_supremo,
  isLeyenda: state.is_leyenda,
  pendingChoice: buildPendingChoice(state, stats),
});

const CharacterController = {
  /**
   * GET /character/state
   *
   * Returns the user's current class state, hero level, and any pending
   * choice modal. If the user hasn't completed onboarding (no stats row yet)
   * returns 200 with `requiresOnboarding: true` so the client can route
   * accordingly without parsing 4xx codes.
   *
   * Triggers a progression re-evaluation so a returning user whose stats
   * already meet a higher gate (e.g. data import) sees the modal without
   * waiting for the next training session.
   */
  async getState(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const stats = await statsService.findByUserId(userId);
      if (!stats) {
        return res.status(200).json({ requiresOnboarding: true });
      }

      const statLevels = toStatLevels(stats as Record<string, unknown>);
      const { state } = await characterService.evaluateAfterStatsUpdate(
        userId,
        statLevels
      );

      return res.status(200).json(serializeState(state, statLevels));
    } catch (err) {
      return sendServerError(res, err, 'CharacterController.getState');
    }
  },

  /**
   * POST /character/choose
   * Body: { tier: 1 | 2 | 3, classId: string }
   *
   * Persists the user's choice at a tier-up modal. Returns the full updated
   * state so the client doesn't need a follow-up GET. Conflict (no pending
   * choice) → 409. Invalid classId for tier → 400. Audit trail emitted on
   * success.
   */
  async choose(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const stats = await statsService.findByUserId(userId);
      if (!stats) {
        return res.status(200).json({ requiresOnboarding: true });
      }

      const { tier, classId } = req.body as ChooseClassBody;
      const statLevels = toStatLevels(stats as Record<string, unknown>);

      const { state, promotedTiers } = await characterService.applyChoice(
        userId,
        tier,
        classId,
        statLevels
      );

      await safeWriteAuditEvent(req, {
        action: 'CHARACTER_CLASS_CHOSEN',
        actorUserId: userId,
        targetUserId: userId,
        metadata: { tier, classId, promotedTiers },
      });

      return res.status(200).json(serializeState(state, statLevels));
    } catch (err: unknown) {
      if (err instanceof ChoiceConflictError) {
        return res.status(409).json({ message: err.message, code: err.code });
      }
      if (err instanceof ChoiceValidationError) {
        return res.status(400).json({ message: err.message, code: err.code });
      }
      return sendServerError(res, err, 'CharacterController.choose');
    }
  },

  /**
   * GET /character/catalog
   *
   * Returns the full hardcoded class catalog. Cached aggressively (see route
   * middleware) — payload is build-time content and identical for every user.
   */
  async getCatalog(_req: AuthRequest, res: Response) {
    return res.status(200).json({
      novice: NOVICE,
      vocations: VOCATIONS,
      specializations: SPECIALIZATIONS,
      legendaries: LEGENDARIES,
    });
  },
};

export default CharacterController;
