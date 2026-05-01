import { Response } from 'express';

import {
  LEGENDARIES,
  NOVICE,
  SPECIALIZATIONS,
  VOCATIONS,
  findLegendary,
  findSpecialization,
  findVocation,
  isValidLegendaryId,
  isValidSpecializationId,
  isValidVocationId,
} from '../data/classes';
import * as characterService from '../services/character.service';
import {
  availableLegendaries,
  availableSpecializations,
  canChooseLegendary,
  canChooseSpecialization,
  canChooseVocation,
  heroLevel,
  recommendedLegendary,
  recommendedSpecialization,
  recommendedVocation,
  type StatLevels,
} from '../services/classProgression.service';
import * as statsService from '../services/stats.service';
import { AuthRequest } from './UserController';

interface StatsRow extends StatLevels {
  [key: string]: unknown;
}

const toStatLevels = (row: StatsRow): StatLevels => ({
  strength: row.strength ?? 0,
  endurance: row.endurance ?? 0,
  stamina: row.stamina ?? 0,
  agility: row.agility ?? 0,
  tenacity: row.tenacity ?? 0,
  vigor: row.vigor ?? 0,
});

const CharacterController = {
  /**
   * GET /character/state
   *
   * Returns the user's current class state, hero level, and any pending
   * choice modal. If a tier choice is pending, includes the available
   * options and the recommended one.
   */
  async getState(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const stats = await statsService.findByUserId(userId);
      if (!stats) {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }

      const statLevels = toStatLevels(stats as StatsRow);
      const state = await characterService.findOrCreateByUserId(userId);

      const vocation = state.vocation_class_id
        ? findVocation(state.vocation_class_id)
        : null;
      const specialization = state.specialization_class_id
        ? findSpecialization(state.specialization_class_id)
        : null;
      const legendary = state.legendary_class_id
        ? findLegendary(state.legendary_class_id)
        : null;

      const choice = buildPendingChoice(state, statLevels);

      return res.status(200).json({
        currentTier: state.current_tier,
        heroLevel: heroLevel(statLevels),
        novice: NOVICE,
        vocation,
        specialization,
        legendary,
        legendaryStage: state.legendary_stage,
        isMaestroSupremo: state.is_maestro_supremo,
        isLeyenda: state.is_leyenda,
        pendingChoice: choice,
      });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to get character state',
        error: error?.message || String(err),
      });
    }
  },

  /**
   * POST /character/choose
   * Body: { tier: 1 | 2 | 3, classId: string }
   *
   * Persists the user's choice at a tier-up modal.
   */
  async choose(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { tier, classId } = req.body as {
        tier?: number;
        classId?: string;
      };

      if (tier !== 1 && tier !== 2 && tier !== 3) {
        return res.status(400).json({ message: 'tier must be 1, 2 or 3' });
      }

      if (typeof classId !== 'string' || classId.length === 0) {
        return res.status(400).json({ message: 'classId is required' });
      }

      const state = await characterService.findOrCreateByUserId(userId);

      if (state.pending_choice_tier !== tier) {
        return res.status(409).json({
          message: `No pending choice at tier ${tier}`,
        });
      }

      const isValid = validateChoice(tier, classId, state);
      if (!isValid) {
        return res
          .status(400)
          .json({ message: 'classId is not valid for this tier' });
      }

      const updated = await characterService.applyChoice(userId, tier, classId);

      return res.status(200).json(updated);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to apply class choice',
        error: error?.message || String(err),
      });
    }
  },

  /**
   * GET /character/catalog
   *
   * Returns the full hardcoded class catalog. The client mirrors the same
   * data, so this endpoint is mainly for debugging / introspection.
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

const buildPendingChoice = (
  state: Awaited<ReturnType<typeof characterService.findOrCreateByUserId>>,
  stats: StatLevels
) => {
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

const validateChoice = (
  tier: 1 | 2 | 3,
  classId: string,
  state: Awaited<ReturnType<typeof characterService.findOrCreateByUserId>>
): boolean => {
  if (tier === 1) {
    return isValidVocationId(classId) && canChooseVocation(classId);
  }
  if (tier === 2) {
    if (!state.vocation_class_id) return false;
    return (
      isValidSpecializationId(classId) &&
      canChooseSpecialization(classId, state.vocation_class_id)
    );
  }
  if (!state.specialization_class_id) return false;
  return (
    isValidLegendaryId(classId) &&
    canChooseLegendary(classId, state.specialization_class_id)
  );
};

export default CharacterController;
