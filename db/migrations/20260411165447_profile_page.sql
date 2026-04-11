-- migrate:up
ALTER type "public"."Sex" rename to "Sex__old_version_to_be_dropped";
CREATE TYPE "public"."Sex" as enum ('MALE', 'FEMALE', 'NON_BINARY');
ALTER TABLE "public"."users" alter column sex type "public"."Sex" USING sex::text::"public"."Sex";
DROP TYPE "public"."Sex__old_version_to_be_dropped";

-- migrate:down
DROP TYPE IF EXISTS "public"."Sex" CASCADE;
