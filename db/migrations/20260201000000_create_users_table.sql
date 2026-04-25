-- migrate:up
CREATE TABLE IF NOT EXISTS "public"."users" (
  "id" SERIAL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "hashed_password" text NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "public"."users" ("email");

-- migrate:down
DROP TABLE IF EXISTS "public"."users";

