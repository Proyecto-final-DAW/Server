-- migrate:up
drop index if exists "public"."user_class_state_pending_choice_tier_idx";
ALTER TABLE "public"."user_class_state" alter column "created_at" set data type timestamp(3) without time zone USING "created_at"::timestamp(3) without time zone;
ALTER TABLE "public"."user_class_state" alter column "updated_at" set data type timestamp(3) without time zone USING "updated_at"::timestamp(3) without time zone;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "injury_notes" character varying(500);
CREATE INDEX user_class_state_pending_choice_tier_idx ON public.user_class_state USING btree (pending_choice_tier);

-- migrate:down
DROP INDEX IF EXISTS public.user_class_state_pending_choice_tier_idx;
