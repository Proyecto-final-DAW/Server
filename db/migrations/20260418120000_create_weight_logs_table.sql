-- migrate:up
CREATE SEQUENCE "public"."weight_logs_id_seq";
CREATE TABLE "public"."weight_logs" (
    "id" integer NOT NULL DEFAULT nextval('weight_logs_id_seq'::regclass),
    "user_id" integer NOT NULL,
    "weight" numeric(5, 2) NOT NULL,
    "date" date NOT NULL,
    "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER SEQUENCE "public"."weight_logs_id_seq" OWNED BY "public"."weight_logs"."id";
CREATE UNIQUE INDEX weight_logs_pkey ON public.weight_logs USING btree (id);
CREATE INDEX weight_logs_user_id_date_idx ON public.weight_logs USING btree (user_id, date);
ALTER TABLE "public"."weight_logs" ADD CONSTRAINT "weight_logs_pkey" PRIMARY KEY USING INDEX "weight_logs_pkey";
ALTER TABLE "public"."weight_logs" ADD CONSTRAINT "weight_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."weight_logs" VALIDATE CONSTRAINT "weight_logs_user_id_fkey";

-- migrate:down
DROP INDEX IF EXISTS public.weight_logs_user_id_date_idx;
DROP INDEX IF EXISTS public.weight_logs_pkey;
DROP TABLE IF EXISTS "public"."weight_logs" CASCADE;
DROP SEQUENCE IF EXISTS "public"."weight_logs_id_seq" CASCADE;
