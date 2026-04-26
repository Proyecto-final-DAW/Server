-- migrate:up
create sequence "public"."audit_logs_id_seq";
create TABLE "public"."audit_logs" (
    "id" integer NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
    "action" text NOT NULL,
    "actor_user_id" integer,
    "target_user_id" integer,
    "request_id" text,
    "ip" text,
    "user_agent" text,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER sequence "public"."audit_logs_id_seq" owned by "public"."audit_logs"."id";
CREATE INDEX audit_logs_action_created_at_idx ON public.audit_logs USING btree (action, created_at DESC);
CREATE INDEX audit_logs_actor_user_id_created_at_idx ON public.audit_logs USING btree (actor_user_id, created_at DESC);
CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);
CREATE INDEX audit_logs_request_id_idx ON public.audit_logs USING btree (request_id);
CREATE INDEX audit_logs_target_user_id_created_at_idx ON public.audit_logs USING btree (target_user_id, created_at DESC);
ALTER TABLE "public"."audit_logs" add CONSTRAINT "audit_logs_pkey" PRIMARY KEY USING index "audit_logs_pkey";
ALTER TABLE "public"."audit_logs" add CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
ALTER TABLE "public"."audit_logs" validate CONSTRAINT "audit_logs_actor_user_id_fkey";
ALTER TABLE "public"."audit_logs" add CONSTRAINT "audit_logs_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;
ALTER TABLE "public"."audit_logs" validate CONSTRAINT "audit_logs_target_user_id_fkey";

-- migrate:down
DROP INDEX IF EXISTS public.audit_logs_target_user_id_created_at_idx;
DROP INDEX IF EXISTS public.audit_logs_request_id_idx;
DROP INDEX IF EXISTS public.audit_logs_pkey;
DROP INDEX IF EXISTS public.audit_logs_actor_user_id_created_at_idx;
DROP INDEX IF EXISTS public.audit_logs_action_created_at_idx;
DROP TABLE IF EXISTS "public"."audit_logs" CASCADE;
DROP SEQUENCE IF EXISTS "public"."audit_logs_id_seq" CASCADE;
