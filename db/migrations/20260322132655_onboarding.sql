-- migrate:up
drop index if exists "public"."onboarding_pkey";
drop index if exists "public"."onboarding_user_id_key";
drop TABLE if exists "public"."onboarding";
drop sequence if exists "public"."onboarding_id_seq";
drop type if exists "public"."ActivityLevel";
drop type if exists "public"."Goal";

-- migrate:down
-- Revert changes manually if needed
-- Review the SQL above to create the appropriate rollback
