-- migrate:up
CREATE SEQUENCE "public"."stats_id_seq";
CREATE TABLE "public"."stats" (
    "id" INTEGER NOT NULL DEFAULT nextval('stats_id_seq'::regclass),
    "user_id" INTEGER UNIQUE NOT NULL,
    "strength" INTEGER NOT NULL DEFAULT 0,
    "endurance" INTEGER NOT NULL DEFAULT 0,
    "speed" INTEGER NOT NULL DEFAULT 0,
    "flexibility" INTEGER NOT NULL DEFAULT 0,
    "strength_level" INTEGER NOT NULL DEFAULT 1,
    "endurance_level" INTEGER NOT NULL DEFAULT 1,
    "speed_level" INTEGER NOT NULL DEFAULT 1,
    "flexibility_level" INTEGER NOT NULL DEFAULT 1,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "last_session_date" DATE,
    "updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER SEQUENCE "public"."stats_id_seq" OWNED BY "public"."stats"."id";
CREATE UNIQUE INDEX stats_pkey ON public.stats USING btree (id);
ALTER TABLE "public"."stats" ADD CONSTRAINT "stats_pkey" PRIMARY KEY USING INDEX "stats_pkey";
ALTER TABLE "public"."stats" ADD CONSTRAINT "stats_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."stats" VALIDATE CONSTRAINT "stats_user_id_fkey";

-- migrate:down
DROP TABLE IF EXISTS "public"."stats";
DROP SEQUENCE IF EXISTS "public"."stats_id_seq";