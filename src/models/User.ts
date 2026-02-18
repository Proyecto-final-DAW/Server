export interface IUser {
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
  created_at: Date;
  updated_at: Date;
}

export type IUserPublic = Omit<IUser, 'hashed_password' | 'tokens'>;
