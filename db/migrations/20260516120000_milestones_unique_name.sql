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
-- row per name.
--
-- FK safety: user_milestones references milestones(id) ON CASCADE.
-- The original assumption that "user_milestones already point at the
-- lowest id" turned out to be wrong — `checkAndUnlock` uses
-- ON CONFLICT (user_id, milestone_id) DO NOTHING, with the conflict
-- key keyed on `milestone_id`, NOT `name`. So both duplicate rows
-- could legitimately have user_milestones pointing at the higher-id
-- one. Without re-pointing first, the DELETE below would fail with
-- 23503 (FK violation) on those environments.
--
-- Step 1: repoint any user_milestones row that references a
-- to-be-deleted duplicate to the surviving (lowest-id) row of the
-- same name — but only when that surviving row doesn't already have
-- the user_milestones entry, to keep the (user_id, milestone_id)
-- unique constraint satisfied.
UPDATE "public"."user_milestones" um
   SET milestone_id = earliest.id
  FROM "public"."milestones" dup
  JOIN "public"."milestones" earliest ON earliest.name = dup.name
 WHERE um.milestone_id = dup.id
   AND dup.id > earliest.id
   AND NOT EXISTS (
     SELECT 1 FROM "public"."user_milestones" um2
      WHERE um2.user_id = um.user_id
        AND um2.milestone_id = earliest.id
   );

-- Step 2: any user_milestones that couldn't be repointed (because the
-- user already had the same milestone_name unlocked via the lowest-id
-- row) are pure duplicates — drop them, the user's "unlocked" status
-- is preserved by the surviving row.
DELETE FROM "public"."user_milestones" um
 USING "public"."milestones" dup, "public"."milestones" earliest
 WHERE um.milestone_id = dup.id
   AND dup.id > earliest.id
   AND dup.name = earliest.name;

-- Step 3: now safe to delete the duplicate milestone rows.
DELETE FROM "public"."milestones" m
 USING "public"."milestones" earliest
 WHERE m.name = earliest.name
   AND m.id > earliest.id;

ALTER TABLE "public"."milestones"
  ADD CONSTRAINT "milestones_name_key" UNIQUE (name);

-- migrate:down
ALTER TABLE "public"."milestones"
  DROP CONSTRAINT IF EXISTS "milestones_name_key";
