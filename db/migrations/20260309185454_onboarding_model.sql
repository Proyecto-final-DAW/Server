-- migrate:up
create type "public"."ActivityLevel" as enum ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');
create type "public"."Goal" as enum ('LOSE_FAT', 'GAIN_MUSCLE', 'MAINTAIN', 'HEALTH');
create sequence "public"."onboarding_id_seq";
create TABLE "public"."onboarding" (
    "id" integer NOT NULL DEFAULT nextval('onboarding_id_seq'::regclass),
    "user_id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "birthDate" date,
    "weight" numeric(4,1),
    "height" numeric(4,1),
    "sex" text,
    "activityLevel" "ActivityLevel",
    "goal" "Goal",
    "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER sequence "public"."onboarding_id_seq" owned by "public"."onboarding"."id";
CREATE UNIQUE INDEX onboarding_pkey ON public.onboarding USING btree (id);
CREATE UNIQUE INDEX onboarding_user_id_key ON public.onboarding USING btree (user_id);
ALTER TABLE "public"."onboarding" add CONSTRAINT "onboarding_pkey" PRIMARY KEY USING index "onboarding_pkey";
ALTER TABLE "public"."onboarding" add CONSTRAINT "onboarding_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."onboarding" validate CONSTRAINT "onboarding_user_id_fkey";

-- migrate:down
DROP INDEX IF EXISTS public.onboarding_user_id_key;
DROP INDEX IF EXISTS public.onboarding_pkey;
DROP TABLE IF EXISTS "public"."onboarding" CASCADE;
DROP SEQUENCE IF EXISTS "public"."onboarding_id_seq" CASCADE;
DROP TYPE IF EXISTS "public"."Goal" CASCADE;
DROP TYPE IF EXISTS "public"."ActivityLevel" CASCADE;
