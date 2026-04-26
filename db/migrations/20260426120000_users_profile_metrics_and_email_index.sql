-- migrate:up
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "activity_level" character varying(100);
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "age" integer;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "height" numeric(4,1);
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "weight" numeric(4,1);

-- Avoid destructive shrink (use larger, safe limits).
ALTER TABLE "public"."users"
  alter column "email" set data type character varying(320) USING "email"::character varying(320);
ALTER TABLE "public"."users"
  alter column "name" set data type character varying(255) USING "name"::character varying(255);

-- Keep a consistent unique index name on email.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'users_email_unique'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'users_email_key'
  ) THEN
    ALTER INDEX "public"."users_email_unique" RENAME TO "users_email_key";
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users USING btree (email);

-- migrate:down
DROP INDEX IF EXISTS public.users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users USING btree (email);

ALTER TABLE "public"."users" alter column "email" set data type text USING "email"::text;
ALTER TABLE "public"."users" alter column "name" set data type text USING "name"::text;

ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "activity_level";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "age";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "height";
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "weight";

