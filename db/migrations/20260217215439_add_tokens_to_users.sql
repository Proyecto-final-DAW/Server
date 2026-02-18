-- migrate:up
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "tokens" text[] DEFAULT ARRAY[]::text[];

-- migrate:down
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "tokens";
