-- migrate:up

-- Diet-streak fields. Mirror the training streak triplet (streak,
-- best_streak, last_session_date) so the same calc-helpers can be
-- reused. Default 0 / NULL means existing users start as if they
-- have never logged a meal — which is true; the feature is new and
-- they couldn't have logged before. No retroactive bonus applied.
ALTER TABLE "public"."stats"
  ADD COLUMN IF NOT EXISTS "diet_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."stats"
  ADD COLUMN IF NOT EXISTS "best_diet_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."stats"
  ADD COLUMN IF NOT EXISTS "last_diet_date" DATE;

-- migrate:down
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "diet_streak";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "best_diet_streak";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "last_diet_date";
