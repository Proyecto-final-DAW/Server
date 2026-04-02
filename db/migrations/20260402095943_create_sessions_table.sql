-- migrate:up
create sequence "public"."sessions_id_seq";
create TABLE "public"."sessions" (
    "id" integer NOT NULL DEFAULT nextval('sessions_id_seq'::regclass),
    "user_id" integer NOT NULL,
    "exercises" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER sequence "public"."sessions_id_seq" owned by "public"."sessions"."id";
CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (id);
ALTER TABLE "public"."sessions" add CONSTRAINT "sessions_pkey" PRIMARY KEY USING index "sessions_pkey";
ALTER TABLE "public"."sessions" add CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."sessions" validate CONSTRAINT "sessions_user_id_fkey";

-- migrate:down
DROP TABLE IF EXISTS "public"."sessions";
DROP SEQUENCE IF EXISTS "public"."sessions_id_seq";
