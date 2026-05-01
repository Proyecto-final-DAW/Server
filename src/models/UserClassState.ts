export type ClassTierStage = 'NORMAL' | 'TRASCENDENTE';

export interface UserClassState {
  user_id: number;
  current_tier: number;
  vocation_class_id: string | null;
  specialization_class_id: string | null;
  legendary_class_id: string | null;
  legendary_stage: ClassTierStage;
  is_maestro_supremo: boolean;
  is_leyenda: boolean;
  pending_choice_tier: number | null;
  updated_at: Date;
}
