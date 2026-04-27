-- migrate:up
INSERT INTO public.milestones (name, description, condition_type, condition_value, icon)
VALUES
  ('Primera sesión', 'Completa tu primera sesión de entrenamiento.', 'TOTAL_SESSIONS', 1, 'trophy'),
  ('Constante', 'Completa 7 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 7, 'trophy'),
  ('Atleta', 'Completa 30 sesiones de entrenamiento.', 'TOTAL_SESSIONS', 30, 'trophy'),

  ('En racha', 'Mantén una racha de 3 días consecutivos.', 'STREAK', 3, 'flame'),
  ('Imparable', 'Mantén una racha de 7 días consecutivos.', 'STREAK', 7, 'flame'),
  ('Legendario', 'Mantén una racha de 30 días consecutivos.', 'STREAK', 30, 'flame'),

  ('Sube de nivel', 'Alcanza nivel 5 en cualquier stat.', 'STAT_LEVEL', 5, 'star'),
  ('Maestro', 'Alcanza nivel 10 en cualquier stat.', 'STAT_LEVEL', 10, 'star'),

  ('Tonelada', 'Levanta un total de 1000 kg acumulados.', 'TOTAL_WEIGHT', 1000, 'dumbbell'),
  ('Diez toneladas', 'Levanta un total de 10000 kg acumulados.', 'TOTAL_WEIGHT', 10000, 'dumbbell');

-- migrate:down
DELETE FROM public.milestones
WHERE name IN (
  'Primera sesión',
  'Constante',
  'Atleta',
  'En racha',
  'Imparable',
  'Legendario',
  'Sube de nivel',
  'Maestro',
  'Tonelada',
  'Diez toneladas'
);
