-- migrate:up

-- The streak unit changed from days to ISO weeks (see streak.service)
-- but the milestone descriptions still say "días consecutivos". A user
-- hitting the "365 días" milestone would actually have trained for ~7
-- years (365 ISO weeks). Update the copy to match the unit so the
-- visible reward matches the actual achievement.
UPDATE public.milestones SET description = 'Manten una racha de 1 semana.'
  WHERE name = 'Despierta';
UPDATE public.milestones SET description = 'Manten una racha de 3 semanas consecutivas.'
  WHERE name = 'Constancia';
UPDATE public.milestones SET description = 'Manten una racha de 7 semanas consecutivas.'
  WHERE name = 'Perseverante';
UPDATE public.milestones SET description = 'Manten una racha de 12 semanas consecutivas.'
  WHERE name = 'Disciplinado';
UPDATE public.milestones SET description = 'Manten una racha de 26 semanas consecutivas.'
  WHERE name = 'Mítico';

-- Re-anchor condition_value to the new unit. Original values were in
-- days (14, 60, 100, 365) which under the weekly streak meant ~14
-- weeks, ~60 weeks, etc. — the descriptions and the gates are now
-- aligned to the same numbers.
UPDATE public.milestones SET condition_value = 1 WHERE name = 'Despierta';
UPDATE public.milestones SET condition_value = 3 WHERE name = 'Constancia';
UPDATE public.milestones SET condition_value = 7 WHERE name = 'Perseverante';
UPDATE public.milestones SET condition_value = 12 WHERE name = 'Disciplinado';
UPDATE public.milestones SET condition_value = 26 WHERE name = 'Mítico';

-- migrate:down
UPDATE public.milestones SET description = 'Manten una racha de 1 dia.', condition_value = 1
  WHERE name = 'Despierta';
UPDATE public.milestones SET description = 'Manten una racha de 14 dias consecutivos.', condition_value = 14
  WHERE name = 'Constancia';
UPDATE public.milestones SET description = 'Manten una racha de 60 dias consecutivos.', condition_value = 60
  WHERE name = 'Perseverante';
UPDATE public.milestones SET description = 'Manten una racha de 100 dias consecutivos.', condition_value = 100
  WHERE name = 'Disciplinado';
UPDATE public.milestones SET description = 'Manten una racha de 365 dias consecutivos.', condition_value = 365
  WHERE name = 'Mítico';
