-- migrate:up
-- Stretching / mobility exercises don't have a meaningful weight or
-- rep count — they're held for a duration. Storing seconds per set
-- keeps the granularity (3 × 30s holds) without conflating it with
-- the rep counter, which now stays for cadence-based moves only.
ALTER TABLE "public"."exercise_sets" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;

-- migrate:down
ALTER TABLE "public"."exercise_sets" DROP COLUMN IF EXISTS "duration_seconds";
