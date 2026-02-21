export interface User {
  id: number;
  name: string;
  email: string;
  hashed_password: string;
  tokens?: string[];
  age?: number;
  weight?: number;
  height?: number;
  activity_level?: string;
  goal?: string;
  sleep_hours?: number;
  created_at: Date;
  updated_at: Date;
}

export type UserPublic = Omit<User, 'hashed_password' | 'tokens'>;
