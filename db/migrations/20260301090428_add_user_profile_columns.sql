-- migrate:up
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "birth_date" date;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "carb_grams" integer;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "daily_calories" integer;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "fat_grams" integer;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean NOT NULL DEFAULT false;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "protein_grams" integer;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "sex" text;

-- migrate:down
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "birth_date";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "carb_grams";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "daily_calories";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "fat_grams";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "onboarding_completed";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "protein_grams";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "sex";
