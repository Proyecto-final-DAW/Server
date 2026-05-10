import {
  CardioIntensity,
  CreateSessionExerciseInput,
} from '../models/Session';

/**
 * Stat sourcing (rebalanced):
 *   FUERZA      ← volumen total (peso × reps) de ejercicios strength
 *   RESISTENCIA ← cardio (minutos × intensidad)
 *   ESTAMINA    ← numero total de series de la sesion
 *   AGILIDAD    ← base + half de la XP de resistencia (cardio)
 *
 * Cada pillar tiene un cap por sesion. Tenacidad y Vigor viven en
 * session.service porque dependen de la racha y de la dieta — no del
 * contenido del entrenamiento.
 *
 * Antes: stretch/explosive aportaban a agilidad/estamina. Cambio porque
 * la mayoria de sesiones reales no incluyen yoga/pliometria, asi que
 * agilidad y estamina se quedaban a 0 — frustrante. Ahora estamina sale
 * del trabajo total (sets) y agilidad de cardio + base.
 */

const XP_THRESHOLD_BASE = 100;
const XP_THRESHOLD_PER_LEVEL = 15;

const VOLUME_DIVISOR = 100;
const STRENGTH_XP_CAP_PER_EXERCISE = 15;
const CARDIO_XP_CAP_PER_EXERCISE = 25;
const CARDIO_DURATION_DIVISOR = 3;

// Per-session caps. The clamp happens after summing all exercises so
// no single marathon session can blow past these.
const STRENGTH_PER_SESSION_CAP = 60;
const ENDURANCE_PER_SESSION_CAP = 40;
const STAMINA_PER_SESSION_CAP = 50;
const AGILITY_PER_SESSION_CAP = 30;

const STAMINA_PER_SET = 1.8;
// Lifting also taxes the cardiovascular system, so each set bleeds a
// little XP into resistencia on top of any cardio entry. Smaller than
// estamina's per-set rate (~28%) because cardio is the primary source.
const ENDURANCE_PER_SET = 0.5;
const AGILITY_BASE = 6;

const INTENSITY_MULTIPLIER: Record<CardioIntensity, number> = {
  LOW: 1.0,
  MEDIUM: 1.3,
  HIGH: 1.6,
};

/**
 * Daily / per-event XP rewards that live OUTSIDE the per-session
 * formula. Session save grants `TENACITY_BASE` + a streak bonus
 * (capped) and a flat `VIGOR_PER_SESSION`; the diet log grants a
 * separate `VIGOR_PER_DIET_LOG`. Net daily ceiling per pillar (when
 * doing both) is intentional:
 *   tenacity = TENACITY_BASE + min(TENACITY_STREAK_CAP, base + streak*step)
 *   vigor    = VIGOR_PER_SESSION + VIGOR_PER_DIET_LOG ≈ 30
 *
 * Centralised here so session.service / diet.service / docs all
 * read from one place — used to be three duplicates that risked
 * drifting apart.
 */
export const TENACITY_BASE_PER_SESSION = 10;
export const TENACITY_STREAK_BONUS_BASE = 15;
export const TENACITY_STREAK_BONUS_STEP = 3;
export const TENACITY_STREAK_BONUS_CAP = 30;
export const VIGOR_PER_SESSION = 20;
export const VIGOR_PER_DIET_LOG = 10;

/**
 * Per-stat cap on the daily XP from training-derived pillars. Today
 * the unique(user_id, date) index makes the daily-cap branch a no-op
 * (priorSessionsToday is always 0), but the constants are kept so
 * the cap shape survives any future relaxation of that constraint.
 */
export const DAILY_XP_CAPS: Record<string, number> = {
  strength: 80,
  endurance: 40,
  stamina: 50,
  agility: 30,
};

/**
 * Hard ceiling for individual stat levels. Matches the game convention
 * where T6 LEYENDA requires `all stats >= 99` — going beyond 99 has no
 * narrative meaning, so we stop the level counter there and discard
 * any extra XP earned.
 */
export const MAX_STAT_LEVEL = 99;

/**
 * XP needed to advance from `level` to `level + 1`. Scales linearly so
 * early levels remain accessible while late levels demand more sessions —
 * preserves the "first 5 are easy, last 20 are a grind" RPG rhythm without
 * a hard wall.
 */
export const xpThresholdForLevel = (level: number): number =>
  XP_THRESHOLD_BASE + level * XP_THRESHOLD_PER_LEVEL;

/**
 * Walks XP up the level ladder, respecting MAX_STAT_LEVEL. Once the
 * cap is reached the XP bar freezes one short of the next threshold so
 * the UI doesn't show ">100% to next level" — there is no next level.
 *
 * Exposed as a single helper so strength/endurance/stamina/agility/vigor
 * (in `applyGains`) and tenacity (in session.service) share exactly the
 * same level-up rules.
 */
export const applyXpToLevel = (
  currentLevel: number,
  pendingXp: number
): { xp: number; level: number } => {
  let level = currentLevel;
  let xp = pendingXp;

  while (level < MAX_STAT_LEVEL && xp >= xpThresholdForLevel(level)) {
    xp -= xpThresholdForLevel(level);
    level += 1;
  }

  if (level >= MAX_STAT_LEVEL) {
    // Freeze XP at threshold-1 so the bar reads "almost full" forever
    // instead of overflowing past 100%.
    xp = Math.min(xp, xpThresholdForLevel(level) - 1);
  }

  return { xp, level };
};

interface StatGain {
  stat: string;
  level: string;
  xp: number;
}

/**
 * Aggregates raw inputs (strength volume, cardio minutes, total sets)
 * across all exercises in the session and converts them into per-stat
 * XP gains, clamped to the per-session caps.
 */
export const calculateGains = (
  exercises: CreateSessionExerciseInput[]
): Map<string, StatGain> => {
  let strengthRawXp = 0;
  let cardioRawXp = 0;
  let totalSets = 0;

  for (const exercise of exercises) {
    if (
      exercise.duration_minutes !== undefined &&
      exercise.duration_minutes > 0
    ) {
      // Cardio entry — feeds resistencia (and indirectly agilidad).
      const intensity = exercise.intensity ?? 'MEDIUM';
      const multiplier = INTENSITY_MULTIPLIER[intensity];
      const xp = Math.floor(
        (exercise.duration_minutes / CARDIO_DURATION_DIVISOR) * multiplier
      );
      cardioRawXp += Math.max(1, Math.min(CARDIO_XP_CAP_PER_EXERCISE, xp));
      continue;
    }

    // Lifted/sets-based exercise. Sets feed estamina regardless of
    // exercise type; volume only counts toward fuerza when the type
    // is strength (catalog default).
    totalSets += exercise.sets.length;

    if (exercise.type === 'strength') {
      const volume = exercise.sets.reduce(
        (sum, set) => sum + set.weight * set.reps,
        0
      );
      if (volume > 0) {
        const xp = Math.floor(2 * Math.sqrt(volume / VOLUME_DIVISOR));
        strengthRawXp += Math.max(
          1,
          Math.min(STRENGTH_XP_CAP_PER_EXERCISE, xp)
        );
      }
    }
  }

  const strengthXp = Math.min(STRENGTH_PER_SESSION_CAP, strengthRawXp);
  // Resistencia = cardio + small per-set contribution from lifting.
  // Pure-strength days no longer leave the bar at zero; pure-cardio
  // days are unchanged because totalSets stays 0.
  const enduranceRaw = cardioRawXp + Math.floor(totalSets * ENDURANCE_PER_SET);
  const enduranceXp = Math.min(ENDURANCE_PER_SESSION_CAP, enduranceRaw);
  const staminaXp = Math.min(
    STAMINA_PER_SESSION_CAP,
    Math.floor(totalSets * STAMINA_PER_SET)
  );

  // Agilidad: base 6 + half of the resistencia gain (after its cap).
  // Capped separately so very long cardio doesn't dominate agilidad.
  const agilityRaw = AGILITY_BASE + Math.floor(enduranceXp / 2);
  const agilityXp = Math.min(AGILITY_PER_SESSION_CAP, agilityRaw);

  const gains = new Map<string, StatGain>();
  if (strengthXp > 0) {
    gains.set('strength', {
      stat: 'strength',
      level: 'strength_level',
      xp: strengthXp,
    });
  }
  if (enduranceXp > 0) {
    gains.set('endurance', {
      stat: 'endurance',
      level: 'endurance_level',
      xp: enduranceXp,
    });
  }
  if (staminaXp > 0) {
    gains.set('stamina', {
      stat: 'stamina',
      level: 'stamina_level',
      xp: staminaXp,
    });
  }
  // Agilidad always gets its base, even on a no-cardio strength day —
  // the user is still on their feet, moving between sets, etc.
  if (agilityXp > 0) {
    gains.set('agility', {
      stat: 'agility',
      level: 'agility_level',
      xp: agilityXp,
    });
  }

  return gains;
};

interface StatUpdate {
  [key: string]: number;
}

/**
 * Applies XP gains to current stats, handling level-ups against the
 * level-scaled threshold (`xpThresholdForLevel`) and the global stat
 * cap (MAX_STAT_LEVEL). Returns a flat object ready for the stats
 * update query.
 */
export const applyGains = (
  currentStats: Record<string, number>,
  gains: Map<string, StatGain>
): StatUpdate => {
  const updates: StatUpdate = {};

  for (const gain of gains.values()) {
    const startingXp = (currentStats[gain.stat] as number) + gain.xp;
    const startingLevel = currentStats[gain.level] as number;
    const { xp, level } = applyXpToLevel(startingLevel, startingXp);
    updates[gain.stat] = xp;
    updates[gain.level] = level;
  }

  return updates;
};
