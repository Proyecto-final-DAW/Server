-- migrate:up

-- Strips Spanish accents from milestone names and descriptions. The
-- pixel font (Press Start 2P) has shaky support for combining diacritics
-- and renders á/í/ó as visibly broken glyphs at small sizes. Source-side
-- fix because the seed migrations are already applied to existing DBs;
-- editing those seeds wouldn't update prod data.

-- Names
UPDATE public.milestones SET name = 'Primera sesion'        WHERE name = 'Primera sesión';
UPDATE public.milestones SET name = 'Manten en racha'       WHERE name = 'En racha';
UPDATE public.milestones SET name = 'Centurion'             WHERE name = 'Centurión';
UPDATE public.milestones SET name = 'Mitico'                WHERE name = 'Mítico';
UPDATE public.milestones SET name = 'Elite'                 WHERE name = 'Élite';
UPDATE public.milestones SET name = 'Levantador titanico'   WHERE name = 'Levantador titánico';

-- Descriptions — bulk replace each accented vowel/letter with its
-- unaccented equivalent. Idempotent: rows already without accents are
-- untouched.
UPDATE public.milestones
   SET description = translate(
                       description,
                       'áéíóúÁÉÍÓÚñÑüÜ',
                       'aeiouAEIOUnNuU'
                     )
 WHERE description ~ '[áéíóúÁÉÍÓÚñÑüÜ]';

-- migrate:down
-- Best-effort restore. Names get put back from the original seeds;
-- descriptions are rebuilt by re-running the original UPDATEs in
-- reverse. Anything seeded with accents in future migrations will
-- need its own rollback.
UPDATE public.milestones SET name = 'Primera sesión'        WHERE name = 'Primera sesion';
UPDATE public.milestones SET name = 'En racha'              WHERE name = 'Manten en racha';
UPDATE public.milestones SET name = 'Centurión'             WHERE name = 'Centurion';
UPDATE public.milestones SET name = 'Mítico'                WHERE name = 'Mitico';
UPDATE public.milestones SET name = 'Élite'                 WHERE name = 'Elite';
UPDATE public.milestones SET name = 'Levantador titánico'   WHERE name = 'Levantador titanico';

UPDATE public.milestones SET description = 'Completa tu primera sesión de entrenamiento.' WHERE description = 'Completa tu primera sesion de entrenamiento.';
UPDATE public.milestones SET description = 'Completa 7 sesiones de entrenamiento.'        WHERE description = 'Completa 7 sesiones de entrenamiento.';
UPDATE public.milestones SET description = 'Mantén una racha de 3 días consecutivos.'     WHERE description = 'Manten una racha de 3 dias consecutivos.';
UPDATE public.milestones SET description = 'Mantén una racha de 7 días consecutivos.'     WHERE description = 'Manten una racha de 7 dias consecutivos.';
UPDATE public.milestones SET description = 'Mantén una racha de 30 días consecutivos.'    WHERE description = 'Manten una racha de 30 dias consecutivos.';
UPDATE public.milestones SET description = 'Alcanza nivel 5 en cualquier stat.'           WHERE description = 'Alcanza nivel 5 en cualquier stat.';
UPDATE public.milestones SET description = 'Alcanza nivel 10 en cualquier stat.'          WHERE description = 'Alcanza nivel 10 en cualquier stat.';
UPDATE public.milestones SET description = 'Mantén una racha de 1 día.'                   WHERE description = 'Manten una racha de 1 dia.';
UPDATE public.milestones SET description = 'Mantén una racha de 14 días consecutivos.'    WHERE description = 'Manten una racha de 14 dias consecutivos.';
UPDATE public.milestones SET description = 'Mantén una racha de 60 días consecutivos.'    WHERE description = 'Manten una racha de 60 dias consecutivos.';
UPDATE public.milestones SET description = 'Mantén una racha de 100 días consecutivos.'   WHERE description = 'Manten una racha de 100 dias consecutivos.';
UPDATE public.milestones SET description = 'Mantén una racha de 365 días consecutivos.'   WHERE description = 'Manten una racha de 365 dias consecutivos.';
