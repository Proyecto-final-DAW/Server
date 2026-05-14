import type {
  Equipment,
  ExperienceLevel,
  Goal,
  Injury,
  Sex,
} from '@prisma/client';

export interface User {
  id: number;
  name: string;
  email: string;
  hashed_password: string;
  tokens?: string[];
  age?: number;
  birth_date?: Date;
  sex?: Sex | null;
  weight?: number;
  height?: number;
  activity_level?: string;
  goals?: Goal[];
  experience_level?: ExperienceLevel | null;
  equipment?: Equipment[];
  days_per_week?: string | null;
  injuries?: Injury[];
  injury_notes?: string | null;
  sleep_hours?: number;
  daily_calories?: number;
  protein_grams?: number;
  fat_grams?: number;
  carb_grams?: number;
  onboarding_completed: boolean;
  created_at: Date;
  updated_at: Date;
}

export type UserPublic = Omit<User, 'hashed_password' | 'tokens'>;
