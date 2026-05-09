-- migrate:up
CREATE TYPE "public"."CardioIntensity" as enum ('LOW', 'MEDIUM', 'HIGH');
ALTER TABLE "public"."session_exercises" ADD COLUMN IF NOT EXISTS "distance_km" numeric(5,2);
ALTER TABLE "public"."session_exercises" ADD COLUMN IF NOT EXISTS "duration_minutes" integer;
ALTER TABLE "public"."session_exercises" ADD COLUMN IF NOT EXISTS "intensity" "CardioIntensity";

-- migrate:down
DROP TYPE IF EXISTS "public"."CardioIntensity" CASCADE;
