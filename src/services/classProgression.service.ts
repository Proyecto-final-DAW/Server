/**
 * classProgression.service.ts — pure progression logic.
 *
 * No DB access, no side effects. All inputs explicit, all outputs derived.
 *
 * Tier gates:
 *   T1 → any stat ≥ 5
 *   T2 → dominant ≥ 15 + secondary ≥ 10
 *   T3 → hero ≥ 25 + dominant ≥ 35 + secondary ≥ 22
 *   T4 → min(stats) ≥ 50          (auto, transcendent form of T3)
 *   T5 → min(stats) ≥ 80          (auto, Maestro Supremo)
 *   T6 → all stats ≥ 99           (cosmetic, Leyenda)
 *
 * Tiers 1, 2, 3 require user choice (modal). Tiers 4, 5, 6 are automatic.
 */

import type {
  LegendaryClass,
  LineageId,
  SpecializationClass,
  StatKey,
  VocationClass,
} from '../data/classes';
import {
  findLegendary,
  findSpecialization,
  findVocation,
  specializationsByLineage,
  STAT_KEYS,
  VOCATIONS,
} from '../data/classes';

export interface StatLevels {
  strength: number;
  endurance: number;
  stamina: number;
  agility: number;
  tenacity: number;
  vigor: number;
}

export const heroLevel = (stats: StatLevels): number => {
  // The display caps at 100 once every stat is maxed at 99 (sum/6 rounds to 99).
  const allMaxed = STAT_KEYS.every((key) => stats[key] >= 99);
  if (allMaxed) return 100;
  const sum = STAT_KEYS.reduce((acc, key) => acc + stats[key], 0);
  return Math.round(sum / STAT_KEYS.length);
};

export const minStat = (stats: StatLevels): number =>
  Math.min(...STAT_KEYS.map((key) => stats[key]));

const sortedStats = (stats: StatLevels): StatKey[] =>
  [...STAT_KEYS].sort((a, b) => stats[b] - stats[a]);

export const dominantStat = (stats: StatLevels): StatKey =>
  sortedStats(stats)[0];

export const secondaryStat = (
  stats: StatLevels,
  excluding: StatKey
): StatKey => {
  const ordered = sortedStats(stats);
  return ordered.find((key) => key !== excluding) ?? ordered[0];
};

// ───── Gate predicates ─────

export const meetsT1Gate = (stats: StatLevels): boolean =>
  STAT_KEYS.some((key) => stats[key] >= 5);

export const meetsT2Gate = (
  stats: StatLevels,
  dominant: StatKey,
  secondary: StatKey
): boolean => stats[dominant] >= 15 && stats[secondary] >= 10;

export const meetsT3Gate = (
  stats: StatLevels,
  dominant: StatKey,
  secondary: StatKey
): boolean =>
  heroLevel(stats) >= 25 && stats[dominant] >= 35 && stats[secondary] >= 22;

export const meetsT4Gate = (stats: StatLevels): boolean => minStat(stats) >= 50;

export const meetsT5Gate = (stats: StatLevels): boolean => minStat(stats) >= 80;

export const meetsT6Gate = (stats: StatLevels): boolean =>
  STAT_KEYS.every((key) => stats[key] >= 99);

// ───── Recommended class per tier ─────

/**
 * Recommended T1 vocation = the one whose dominant stat is the user's
 * highest stat right now.
 */
export const recommendedVocation = (stats: StatLevels): VocationClass => {
  const dom = dominantStat(stats);
  const match = VOCATIONS.find((v) => v.dominantStat === dom);
  if (!match) {
    throw new Error(`No vocation found for dominant stat: ${dom}`);
  }
  return match;
};

/**
 * Recommended T2 specialization within a chosen lineage = the one whose
 * secondary stat matches the user's second-highest stat. Falls back to the
 * spec with the highest user score on its `secondaryStat` if the second-highest
 * stat happens to match the dominant (effectively a tie at zero).
 */
export const recommendedSpecialization = (
  stats: StatLevels,
  lineage: LineageId
): SpecializationClass => {
  const vocation = VOCATIONS.find((v) => v.id === lineage);
  if (!vocation) throw new Error(`Unknown lineage: ${lineage}`);
  const sec = secondaryStat(stats, vocation.dominantStat);
  const lineageSpecs = specializationsByLineage(lineage);
  const match = lineageSpecs.find((s) => s.secondaryStat === sec);
  if (match) return match;

  // Fallback: pick the spec whose secondaryStat is strongest in the user.
  return lineageSpecs.reduce((best, candidate) =>
    stats[candidate.secondaryStat] > stats[best.secondaryStat]
      ? candidate
      : best
  );
};

/**
 * Recommended T3 legendary among a specialization's two options = the one
 * whose required stats average highest in the user's profile. Averaging
 * (rather than summing) avoids favoring two-stat legendaries over single-stat
 * ones when the user is much stronger in the single stat.
 */
export const recommendedLegendary = (
  stats: StatLevels,
  specializationId: string
): LegendaryClass => {
  const spec = findSpecialization(specializationId);
  if (!spec) throw new Error(`Unknown specialization: ${specializationId}`);

  const [optionAId, optionBId] = spec.legendaryOptions;
  const optionA = findLegendary(optionAId);
  const optionB = findLegendary(optionBId);
  if (!optionA || !optionB) {
    throw new Error(
      `Specialization ${specializationId} references unknown legendary`
    );
  }

  const score = (legendary: LegendaryClass): number => {
    const sum = legendary.requiredStats.reduce(
      (acc, key) => acc + stats[key],
      0
    );
    return sum / legendary.requiredStats.length;
  };

  return score(optionA) >= score(optionB) ? optionA : optionB;
};

// ───── Available choices per tier (for modal display) ─────

export const availableVocations = (): readonly VocationClass[] => VOCATIONS;

export const availableSpecializations = (
  lineage: LineageId
): SpecializationClass[] => specializationsByLineage(lineage);

export const availableLegendaries = (
  specializationId: string
): LegendaryClass[] => {
  const spec = findSpecialization(specializationId);
  if (!spec) return [];
  return spec.legendaryOptions
    .map((id) => findLegendary(id))
    .filter((l): l is LegendaryClass => l !== undefined);
};

// ───── Validation: is a chosen class allowed at this tier? ─────

export const canChooseVocation = (vocationId: string): boolean =>
  VOCATIONS.some((v) => v.id === vocationId);

export const canChooseSpecialization = (
  specializationId: string,
  vocationId: string
): boolean => {
  const spec = findSpecialization(specializationId);
  return spec !== undefined && spec.lineage === vocationId;
};

export const canChooseLegendary = (
  legendaryId: string,
  specializationId: string
): boolean => {
  const spec = findSpecialization(specializationId);
  if (!spec) return false;
  return (spec.legendaryOptions as readonly string[]).includes(legendaryId);
};

// ───── Dominant/secondary inferred from user choices ─────

export const dominantStatOfVocation = (
  vocationId: string
): StatKey | undefined => findVocation(vocationId)?.dominantStat;

export const secondaryStatOfSpecialization = (
  specializationId: string
): StatKey | undefined => findSpecialization(specializationId)?.secondaryStat;

// ───── Highest tier the user qualifies for, given current state ─────

export interface CurrentState {
  current_tier: number;
  vocation_class_id: string | null;
  specialization_class_id: string | null;
  legendary_class_id: string | null;
}

export interface TierEvaluation {
  /** Choice modal needed for this tier (1, 2 or 3) — or null if none pending. */
  pendingChoiceTier: 1 | 2 | 3 | null;
  /** Auto-applied tier upgrades (4, 5, 6). */
  autoTierUpgrades: number[];
}

/**
 * Evaluates a user's stats against their current progression state, returning
 * any pending choice and any automatic tier upgrades to apply.
 *
 * Pure function: caller decides how to persist the result.
 */
export const evaluateProgression = (
  stats: StatLevels,
  state: CurrentState
): TierEvaluation => {
  const upgrades: number[] = [];
  let pending: TierEvaluation['pendingChoiceTier'] = null;

  // T1
  if (state.current_tier < 1 && meetsT1Gate(stats)) {
    pending = 1;
    return { pendingChoiceTier: pending, autoTierUpgrades: upgrades };
  }

  // T2 (requires vocation chosen)
  if (state.current_tier === 1 && state.vocation_class_id) {
    const dom = dominantStatOfVocation(state.vocation_class_id);
    if (dom) {
      const sec = secondaryStat(stats, dom);
      if (meetsT2Gate(stats, dom, sec)) {
        pending = 2;
        return { pendingChoiceTier: pending, autoTierUpgrades: upgrades };
      }
    }
  }

  // T3 (requires specialization chosen)
  if (state.current_tier === 2 && state.specialization_class_id) {
    const spec = findSpecialization(state.specialization_class_id);
    if (spec) {
      const dom = findVocation(spec.lineage)?.dominantStat;
      if (dom && meetsT3Gate(stats, dom, spec.secondaryStat)) {
        pending = 3;
        return { pendingChoiceTier: pending, autoTierUpgrades: upgrades };
      }
    }
  }

  // T4 (auto: transcendent form of legendary)
  if (state.current_tier === 3 && meetsT4Gate(stats)) {
    upgrades.push(4);
  }

  // T5 (auto: Maestro Supremo)
  if (
    (state.current_tier === 4 || upgrades.includes(4)) &&
    meetsT5Gate(stats)
  ) {
    upgrades.push(5);
  }

  // T6 (auto: Leyenda)
  if ((state.current_tier >= 5 || upgrades.includes(5)) && meetsT6Gate(stats)) {
    upgrades.push(6);
  }

  return { pendingChoiceTier: pending, autoTierUpgrades: upgrades };
};

// ───── Re-export the union types used by callers ─────

export type { LineageId, StatKey } from '../data/classes';
