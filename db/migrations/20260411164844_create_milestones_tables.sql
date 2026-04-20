-- migrate:up
CREATE TYPE "public"."ConditionType" as enum ('STAT_LEVEL', 'STREAK', 'TOTAL_SESSIONS', 'TOTAL_WEIGHT');
create sequence "public"."milestones_id_seq";
create sequence "public"."user_milestones_id_seq";
create TABLE "public"."milestones" (
    "id" integer NOT NULL DEFAULT nextval('milestones_id_seq'::regclass),
    "name" character varying(100) NOT NULL,
    "description" text NOT NULL,
    "condition_type" "ConditionType" NOT NULL,
    "condition_value" integer NOT NULL,
    "icon" character varying(50) NOT NULL
);
create TABLE "public"."user_milestones" (
    "id" integer NOT NULL DEFAULT nextval('user_milestones_id_seq'::regclass),
    "user_id" integer NOT NULL,
    "milestone_id" integer NOT NULL,
    "unlocked_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER sequence "public"."milestones_id_seq" owned by "public"."milestones"."id";
ALTER sequence "public"."user_milestones_id_seq" owned by "public"."user_milestones"."id";
CREATE UNIQUE INDEX milestones_pkey ON public.milestones USING btree (id);
CREATE UNIQUE INDEX user_milestones_pkey ON public.user_milestones USING btree (id);
CREATE UNIQUE INDEX user_milestones_user_id_milestone_id_key ON public.user_milestones USING btree (user_id, milestone_id);
ALTER TABLE "public"."milestones" add CONSTRAINT "milestones_pkey" PRIMARY KEY USING index "milestones_pkey";
ALTER TABLE "public"."user_milestones" add CONSTRAINT "user_milestones_pkey" PRIMARY KEY USING index "user_milestones_pkey";
ALTER TABLE "public"."user_milestones" add CONSTRAINT "user_milestones_milestone_id_fkey" FOREIGN KEY (milestone_id) REFERENCES milestones(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."user_milestones" validate CONSTRAINT "user_milestones_milestone_id_fkey";
ALTER TABLE "public"."user_milestones" add CONSTRAINT "user_milestones_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."user_milestones" validate CONSTRAINT "user_milestones_user_id_fkey";

-- migrate:down
DROP INDEX IF EXISTS public.user_milestones_user_id_milestone_id_key;
DROP INDEX IF EXISTS public.user_milestones_pkey;
DROP INDEX IF EXISTS public.milestones_pkey;
DROP TABLE IF EXISTS "public"."user_milestones" CASCADE;
DROP TABLE IF EXISTS "public"."milestones" CASCADE;
DROP SEQUENCE IF EXISTS "public"."user_milestones_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "public"."milestones_id_seq" CASCADE;
DROP TYPE IF EXISTS "public"."ConditionType" CASCADE;
