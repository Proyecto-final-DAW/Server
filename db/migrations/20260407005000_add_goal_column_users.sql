-- migrate:up
ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "goal" text;

-- migrate:down
ALTER TABLE "public"."users"
  DROP COLUMN IF EXISTS "goal";

