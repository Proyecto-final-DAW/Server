export enum TipType {
  FIRST_WEEK = 'FIRST_WEEK',
  INACTIVE_3_DAYS = 'INACTIVE_3_DAYS',
  NEW_ACHIEVEMENT = 'NEW_ACHIEVEMENT',
  HIGH_STREAK = 'HIGH_STREAK',
  GENERAL = 'GENERAL',
}

export interface Tip {
  id: number;
  type: TipType;
  content: string;
  active: boolean;
  created_at: Date;
}

export type TipsByType = Record<TipType, Tip[]>;
