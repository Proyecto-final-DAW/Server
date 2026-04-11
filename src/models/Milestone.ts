export type ConditionType =
  | 'STAT_LEVEL'
  | 'STREAK'
  | 'TOTAL_SESSIONS'
  | 'TOTAL_WEIGHT';

export interface Milestone {
  id: number;
  name: string;
  description: string;
  condition_type: ConditionType;
  condition_value: number;
  icon: string;
}

export interface UserMilestone {
  id: number;
  user_id: number;
  milestone_id: number;
  unlocked_at: Date;
}

export interface UnlockedMilestone extends Milestone {
  unlocked_at: Date;
}
