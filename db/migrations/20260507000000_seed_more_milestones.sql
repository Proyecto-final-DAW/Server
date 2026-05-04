-- migrate:up

-- Adds 20 new milestones on top of the original 10 from
-- 20260426161323_seed_milestones, bringing the total to 30. The icon names
-- match the keys handled by `client/src/features/achievements/ui/components/MilestoneCard.tsx`
-- (trophy / flame / star / dumbbell / bolt / crown). Anything else falls back
-- to the trophy icon, so unknown values are visually safe.

INSERT INTO public.milestones (name, description, condition_type, condition_value, icon)
VALUES
  -- TOTAL_SESSIONS extras
  ('Iniciado', 'Completa 3 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 3, 'star'),
  ('Veterano', 'Completa 50 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 50, 'trophy'),
  ('Centurión', 'Completa 100 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 100, 'crown'),
  ('Inquebrantable', 'Completa 250 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 250, 'crown'),
  ('Inmortal', 'Completa 500 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 500, 'crown'),

  -- STREAK extras
  ('Despierta', 'Mantén una racha de 1 día.', 'STREAK', 1, 'flame'),
  ('Constancia', 'Mantén una racha de 14 días consecutivos.', 'STREAK', 14, 'flame'),
  ('Perseverante', 'Mantén una racha de 60 días consecutivos.', 'STREAK', 60, 'flame'),
  ('Disciplinado', 'Mantén una racha de 100 días consecutivos.', 'STREAK', 100, 'crown'),
  ('Mítico', 'Mantén una racha de 365 días consecutivos.', 'STREAK', 365, 'crown'),

  -- STAT_LEVEL extras
  ('Aprendiz', 'Alcanza nivel 15 en cualquier stat.', 'STAT_LEVEL', 15, 'star'),
  ('Veterano de stat', 'Alcanza nivel 25 en cualquier stat.', 'STAT_LEVEL', 25, 'bolt'),
  ('Especialista', 'Alcanza nivel 50 en cualquier stat.', 'STAT_LEVEL', 50, 'bolt'),
  ('Élite', 'Alcanza nivel 75 en cualquier stat.', 'STAT_LEVEL', 75, 'crown'),
  ('Trascendente', 'Alcanza nivel 99 en cualquier stat.', 'STAT_LEVEL', 99, 'crown'),

  -- TOTAL_WEIGHT extras
  ('Despegue', 'Levanta un total de 100 kg acumulados.', 'TOTAL_WEIGHT', 100, 'dumbbell'),
  ('Media tonelada', 'Levanta un total de 500 kg acumulados.', 'TOTAL_WEIGHT', 500, 'dumbbell'),
  ('Cien toneladas', 'Levanta un total de 100000 kg acumulados.', 'TOTAL_WEIGHT', 100000, 'dumbbell'),
  ('Mil toneladas', 'Levanta un total de 1000000 kg acumulados.', 'TOTAL_WEIGHT', 1000000, 'crown'),
  ('Levantador titánico', 'Levanta un total de 5000000 kg acumulados.', 'TOTAL_WEIGHT', 5000000, 'crown');

-- migrate:down
DELETE FROM public.milestones
WHERE name IN (
  'Iniciado',
  'Veterano',
  'Centurión',
  'Inquebrantable',
  'Inmortal',
  'Despierta',
  'Constancia',
  'Perseverante',
  'Disciplinado',
  'Mítico',
  'Aprendiz',
  'Veterano de stat',
  'Especialista',
  'Élite',
  'Trascendente',
  'Despegue',
  'Media tonelada',
  'Cien toneladas',
  'Mil toneladas',
  'Levantador titánico'
);
