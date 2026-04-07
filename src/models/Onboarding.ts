export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHT'
  | 'MODERATE'
  | 'ACTIVE'
  | 'VERY_ACTIVE';

export type Goal = 'LOSE_FAT' | 'GAIN_MUSCLE' | 'MAINTAIN' | 'HEALTH';

/** Request body for POST /onboarding; persisted on the authenticated user's row in `users`. */
export interface OnboardingFormData {
  name: string;
  birthDate: string;
  weight: string;
  height: string;
  sex?: 'MALE' | 'FEMALE';
  activityLevel?: ActivityLevel;
  goal?: Goal;
}
