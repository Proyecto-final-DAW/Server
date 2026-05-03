export type ClassTierStage = 'NORMAL' | 'TRANSCENDENT';

export interface UserClassState {
  user_id: number;
  current_tier: number;
  vocation_class_id: string | null;
  specialization_class_id: string | null;
  legendary_class_id: string | null;
  legendary_stage: ClassTierStage | null;
  is_maestro_supremo: boolean;
  is_leyenda: boolean;
  pending_choice_tier: number | null;
  created_at: Date;
  updated_at: Date;
}
