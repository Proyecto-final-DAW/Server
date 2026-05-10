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
-- Self-healing dedupe BEFORE the constraint, mirroring the sessions
-- migration: any environment that re-applied a seed already has
-- duplicates and would otherwise fail with 23505. Keep the earliest
-- row per name; user_milestones FK references stay intact because
-- existing user_milestones already point to the kept (lowest) id —
-- the duplicate rows the user couldn't have unlocked yet.
DELETE FROM "public"."milestones" m
 USING "public"."milestones" earliest
 WHERE m.name = earliest.name
   AND m.id > earliest.id;

ALTER TABLE "public"."milestones"
  ADD CONSTRAINT "milestones_name_key" UNIQUE (name);

-- migrate:down
ALTER TABLE "public"."milestones"
  DROP CONSTRAINT IF EXISTS "milestones_name_key";
