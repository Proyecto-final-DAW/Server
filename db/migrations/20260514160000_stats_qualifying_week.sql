-- migrate:up

-- Tracks the Monday (UTC) of the most recent ISO week in which the
-- user reached their `days_per_week` target. Powers the routine-aware
-- streak: streak is alive iff this column is the current or previous
-- ISO week's Monday; older means the user dropped a week and the
-- stored streak number is stale (the read path returns 0).
--
-- Nullable because a user may never have hit their target yet — the
-- column is set the first time a session crosses the threshold.
ALTER TABLE "public"."stats"
  ADD COLUMN IF NOT EXISTS "last_qualifying_week_monday" DATE;

-- migrate:down
ALTER TABLE "public"."stats"
  DROP COLUMN IF EXISTS "last_qualifying_week_monday";
