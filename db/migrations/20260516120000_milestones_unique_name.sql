-- migrate:up

-- Enforce milestone-name uniqueness at the DB level so the seed
-- migrations become idempotent. The seed scripts use plain
-- INSERT ... VALUES — running them twice on the same DB would
-- create duplicate milestone rows, and the next session save would
-- fire the "first session" milestone over and over because every
-- duplicate row matches the unlock condition independently.
--
-- The constraint also lets future seed migrations use
-- `ON CONFLICT (name) DO NOTHING` to be safely re-runnable on
-- already-seeded environments.
--
-- If duplicate rows already exist (re-applied seed), this migration
-- aborts. Cleanup query for that case:
--
--   DELETE FROM milestones a USING milestones b
--   WHERE a.id > b.id AND a.name = b.name;
ALTER TABLE "public"."milestones"
  ADD CONSTRAINT "milestones_name_key" UNIQUE (name);

-- migrate:down
ALTER TABLE "public"."milestones"
  DROP CONSTRAINT IF EXISTS "milestones_name_key";
