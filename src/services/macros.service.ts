/**
 * macros.service.ts — Daily energy and macro targets (Mifflin–St Jeor).
 *
 * Weight in kg, height in cm. Activity is the physical activity level (PAL) multiplier (1.2–1.9).
 * `Sex` and `Goal` match Prisma enums (UPPERCASE values).
 */

import { Goal, Sex } from '@prisma/client';

export interface MacroTargets {
  daily_calories: number;
  protein_grams: number;
  fat_grams: number;
  carb_grams: number;
}

const PROTEIN_G_PER_KG = 2;
const FAT_CALORIE_SHARE = 0.25;
const LOSE_ADJUSTMENT_KCAL = -500;
const GAIN_ADJUSTMENT_KCAL = 400;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;
const MIN_ACTIVITY_FACTOR = 1.2;
const MAX_ACTIVITY_FACTOR = 1.9;

function basalMetabolicRate(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex
): number {
  const weightHeightAgeComponentKcal =
    10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === Sex.MALE
    ? weightHeightAgeComponentKcal + 5
    : weightHeightAgeComponentKcal - 161;
}

function goalAdjustedCalories(
  totalDailyEnergyExpenditureKcal: number,
  goal: Goal
): number {
  switch (goal) {
    case Goal.LOSE_FAT:
      return totalDailyEnergyExpenditureKcal + LOSE_ADJUSTMENT_KCAL;
    case Goal.GAIN_MUSCLE:
      return totalDailyEnergyExpenditureKcal + GAIN_ADJUSTMENT_KCAL;
    case Goal.MAINTAIN:
    case Goal.HEALTH:
      return totalDailyEnergyExpenditureKcal;
    default: {
      const _exhaustive: never = goal;
      return _exhaustive;
    }
  }
}

/**
 * Computes daily calorie target and macro split: 2 g protein/kg, ~25% kcal from fat, remainder carbs.
 */
export function calculateCalories(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex,
  activityFactor: number,
  goal: Goal
): MacroTargets {
  if (
    weightKg <= 0 ||
    heightCm <= 0 ||
    age <= 0 ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(age) ||
    !Number.isFinite(activityFactor)
  ) {
    throw new RangeError(
      'weightKg, heightCm, age, and activityFactor must be positive finite numbers'
    );
  }
  if (
    activityFactor < MIN_ACTIVITY_FACTOR ||
    activityFactor > MAX_ACTIVITY_FACTOR
  ) {
    throw new RangeError(
      `activityFactor must be between ${MIN_ACTIVITY_FACTOR} and ${MAX_ACTIVITY_FACTOR}`
    );
  }

  const basalMetabolicRateKcalPerDay = basalMetabolicRate(
    weightKg,
    heightCm,
    age,
    sex
  );
  const totalDailyEnergyExpenditureKcal =
    basalMetabolicRateKcalPerDay * activityFactor;
  const daily_calories = Math.round(
    goalAdjustedCalories(totalDailyEnergyExpenditureKcal, goal)
  );

  const protein_grams = Math.round(PROTEIN_G_PER_KG * weightKg);
  const fat_grams = Math.round(
    (FAT_CALORIE_SHARE * daily_calories) / KCAL_PER_G_FAT
  );

  const remainingKcal =
    daily_calories -
    protein_grams * KCAL_PER_G_PROTEIN -
    fat_grams * KCAL_PER_G_FAT;
  const carb_grams = Math.max(0, Math.round(remainingKcal / KCAL_PER_G_CARB));

  return {
    daily_calories,
    protein_grams,
    fat_grams,
    carb_grams,
  };
}
