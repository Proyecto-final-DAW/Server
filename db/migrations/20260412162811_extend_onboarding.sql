-- migrate:up

-- 1) New enums (independent of existing types)
CREATE TYPE "public"."Equipment" AS ENUM ('FULL_GYM', 'HOME_WEIGHTS', 'BODYWEIGHT');
CREATE TYPE "public"."ExperienceLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "public"."Injury" AS ENUM ('NONE', 'KNEE', 'BACK', 'SHOULDER', 'OTHER');

-- 2) Snapshot existing goal into a text array so we can restore it after the enum rename
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "goals_tmp" text[] DEFAULT ARRAY[]::text[];
UPDATE "public"."users"
  SET "goals_tmp" = CASE
    WHEN "goal" IS NULL THEN ARRAY[]::text[]
    WHEN "goal"::text = 'LOSE' THEN ARRAY['LOSE_FAT']
    WHEN "goal"::text = 'GAIN' THEN ARRAY['GAIN_MUSCLE']
    WHEN "goal"::text = 'MAINTAIN' THEN ARRAY['MAINTAIN']
    ELSE ARRAY[]::text[]
  END;

-- 3) Drop singular goal column, then swap the Goal enum for the new one
ALTER TABLE "public"."users" DROP COLUMN "goal";
ALTER TYPE "public"."Goal" RENAME TO "Goal__old_version_to_be_dropped";
CREATE TYPE "public"."Goal" AS ENUM ('LOSE_FAT', 'GAIN_MUSCLE', 'MAINTAIN', 'HEALTH');
DROP TYPE "public"."Goal__old_version_to_be_dropped";

-- 4) Add the rest of the new columns
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "days_per_week" character varying(10);
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "equipment" "Equipment";
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "experience_level" "ExperienceLevel";
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "goals" "Goal"[] DEFAULT ARRAY[]::"Goal"[];
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "injuries" "Injury"[] DEFAULT ARRAY[]::"Injury"[];

-- 5) Rehydrate goals from the snapshot and drop the temp column
UPDATE "public"."users" SET "goals" = "goals_tmp"::"Goal"[];
ALTER TABLE "public"."users" DROP COLUMN "goals_tmp";

-- migrate:down

-- Drop new scalar/array columns
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "injuries";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "days_per_week";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "equipment";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "experience_level";

-- Snapshot goals array before dropping the new Goal enum
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "goal_tmp" text;
UPDATE "public"."users"
  SET "goal_tmp" = CASE
    WHEN array_length("goals", 1) IS NULL THEN NULL
    WHEN "goals"[1]::text = 'LOSE_FAT' THEN 'LOSE'
    WHEN "goals"[1]::text = 'GAIN_MUSCLE' THEN 'GAIN'
    WHEN "goals"[1]::text = 'MAINTAIN' THEN 'MAINTAIN'
    WHEN "goals"[1]::text = 'HEALTH' THEN 'MAINTAIN'
    ELSE NULL
  END;
ALTER TABLE "public"."users" DROP COLUMN "goals";

-- Swap Goal enum back to legacy values
ALTER TYPE "public"."Goal" RENAME TO "Goal__new_version_to_be_dropped";
CREATE TYPE "public"."Goal" AS ENUM ('LOSE', 'GAIN', 'MAINTAIN');
DROP TYPE "public"."Goal__new_version_to_be_dropped";

-- Restore singular goal column and drop temp
ALTER TABLE "public"."users" ADD COLUMN "goal" "Goal";
UPDATE "public"."users" SET "goal" = "goal_tmp"::"Goal";
ALTER TABLE "public"."users" DROP COLUMN "goal_tmp";

-- Drop new enums
DROP TYPE IF EXISTS "public"."Injury";
DROP TYPE IF EXISTS "public"."Equipment";
DROP TYPE IF EXISTS "public"."ExperienceLevel";
