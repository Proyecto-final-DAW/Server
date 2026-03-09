export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type Goal = 'lose_fat' | 'gain_muscle' | 'maintain' | 'health';

export interface OnboardingFormData {
  name: string;
  birthDate: string;
  weight: string;
  height: string;
  sex?: 'male' | 'female';
  activityLevel?: ActivityLevel;
  goal?: Goal;
}
