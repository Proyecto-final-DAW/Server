-- migrate:up
ALTER TABLE "public"."stats" DROP COLUMN "flexibility";
ALTER TABLE "public"."stats" DROP COLUMN "flexibility_level";
ALTER TABLE "public"."stats" DROP COLUMN "speed";
ALTER TABLE "public"."stats" DROP COLUMN "speed_level";
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "agility" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "agility_level" integer NOT NULL DEFAULT 1;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "stamina" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "stamina_level" integer NOT NULL DEFAULT 1;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "tenacity" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "tenacity_level" integer NOT NULL DEFAULT 1;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "vigor" integer NOT NULL DEFAULT 0;
ALTER TABLE "public"."stats" ADD COLUMN IF NOT EXISTS "vigor_level" integer NOT NULL DEFAULT 1;

-- migrate:down
ALTER TABLE "public"."stats" DROP COLUMN "flexibility";
ALTER TABLE "public"."stats" DROP COLUMN "flexibility_level";
ALTER TABLE "public"."stats" DROP COLUMN "speed";
ALTER TABLE "public"."stats" DROP COLUMN "speed_level";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "agility";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "agility_level";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "stamina";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "stamina_level";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "tenacity";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "tenacity_level";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "vigor";
ALTER TABLE "public"."stats" DROP COLUMN IF EXISTS "vigor_level";
