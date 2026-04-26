-- migrate:up
UPDATE "public"."users"
SET "email" = lower("email")
WHERE "email" IS NOT NULL AND "email" <> lower("email");

ALTER TABLE "public"."users"
  ADD CONSTRAINT users_email_lowercase_chk
  CHECK ("email" = lower("email"));

-- migrate:down
ALTER TABLE "public"."users"
  DROP CONSTRAINT IF EXISTS users_email_lowercase_chk;

