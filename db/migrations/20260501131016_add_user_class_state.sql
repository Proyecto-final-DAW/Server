-- migrate:up
CREATE TYPE "public"."ClassTierStage" as enum ('NORMAL', 'TRASCENDENTE');
drop index if exists "public"."users_email_unique";
create TABLE "public"."user_class_state" (
    "user_id" integer NOT NULL,
    "current_tier" integer NOT NULL DEFAULT 0,
    "vocation_class_id" character varying(50),
    "specialization_class_id" character varying(50),
    "legendary_class_id" character varying(50),
    "legendary_stage" "ClassTierStage" NOT NULL DEFAULT 'NORMAL'::"ClassTierStage",
    "is_maestro_supremo" boolean NOT NULL DEFAULT false,
    "is_leyenda" boolean NOT NULL DEFAULT false,
    "pending_choice_tier" integer,
    "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "public"."sessions" alter column "date" drop default;
ALTER TABLE "public"."users" DROP COLUMN "goal";
CREATE UNIQUE INDEX user_class_state_pkey ON public.user_class_state USING btree (user_id);
ALTER TABLE "public"."user_class_state" add CONSTRAINT "user_class_state_pkey" PRIMARY KEY USING index "user_class_state_pkey";
ALTER TABLE "public"."user_class_state" add CONSTRAINT "user_class_state_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."user_class_state" validate CONSTRAINT "user_class_state_user_id_fkey";

-- migrate:down
DROP INDEX IF EXISTS public.user_class_state_pkey;
DROP TABLE IF EXISTS "public"."user_class_state" CASCADE;
DROP TYPE IF EXISTS "public"."ClassTierStage" CASCADE;
