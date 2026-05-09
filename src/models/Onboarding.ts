export type ActivityLevel =
  | 'SEDENTARY'
  | 'LIGHT'
  | 'MODERATE'
  | 'ACTIVE'
  | 'VERY_ACTIVE';

export type Goal = 'LOSE_FAT' | 'GAIN_MUSCLE' | 'MAINTAIN' | 'HEALTH';

export type ExperienceLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type Equipment = 'FULL_GYM' | 'HOME_WEIGHTS' | 'BODYWEIGHT';

export type DaysPerWeek = '2-3' | '4-5' | '6+';

export type Injury = 'NONE' | 'KNEE' | 'BACK' | 'SHOULDER' | 'OTHER';

/** Request body for PUT /onboarding; persisted on the authenticated user's row in `users`. */
export interface OnboardingFormData {
  name: string;
  birthDate: string;
  weight: string;
  height: string;
  sex?: 'MALE' | 'FEMALE';
  activityLevel?: ActivityLevel;
  goals?: Goal[];
  experienceLevel?: ExperienceLevel;
  equipment?: Equipment[];
  daysPerWeek?: DaysPerWeek;
  injuries?: Injury[];
  /** Free-text detail surfaced by the wizard when 'OTHER' is among `injuries`. */
  injuryNotes?: string;
}
