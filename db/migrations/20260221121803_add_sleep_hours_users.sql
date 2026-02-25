-- migrate:up
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "sleep_hours" integer;

-- migrate:down
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "sleep_hours";
