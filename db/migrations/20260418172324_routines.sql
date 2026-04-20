-- migrate:up
create sequence "public"."routine_exercises_id_seq";
create sequence "public"."routines_id_seq";
create TABLE "public"."routine_exercises" (
    "id" integer NOT NULL DEFAULT nextval('routine_exercises_id_seq'::regclass),
    "routine_id" integer NOT NULL,
    "exercise_api_id" character varying(50) NOT NULL,
    "exercise_name" character varying(200),
    "sets" integer,
    "reps" integer,
    "order_index" integer
);
create TABLE "public"."routines" (
    "id" integer NOT NULL DEFAULT nextval('routines_id_seq'::regclass),
    "user_id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "description" text,
    "created_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER sequence "public"."routine_exercises_id_seq" owned by "public"."routine_exercises"."id";
ALTER sequence "public"."routines_id_seq" owned by "public"."routines"."id";

CREATE UNIQUE INDEX routine_exercises_pkey ON public.routine_exercises USING btree (id);
CREATE UNIQUE INDEX routines_pkey ON public.routines USING btree (id);

ALTER TABLE "public"."routine_exercises" add CONSTRAINT "routine_exercises_pkey" PRIMARY KEY USING index "routine_exercises_pkey";
ALTER TABLE "public"."routines" add CONSTRAINT "routines_pkey" PRIMARY KEY USING index "routines_pkey";

ALTER TABLE "public"."routine_exercises" add CONSTRAINT "routine_exercises_routine_id_fkey" FOREIGN KEY (routine_id) REFERENCES routines(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."routine_exercises" validate CONSTRAINT "routine_exercises_routine_id_fkey";
ALTER TABLE "public"."routines" add CONSTRAINT "routines_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;
ALTER TABLE "public"."routines" validate CONSTRAINT "routines_user_id_fkey";

-- migrate:down
DROP INDEX IF EXISTS public.routines_pkey;
DROP INDEX IF EXISTS public.routine_exercises_pkey;
DROP TABLE IF EXISTS "public"."routines" CASCADE;
DROP TABLE IF EXISTS "public"."routine_exercises" CASCADE;
DROP SEQUENCE IF EXISTS "public"."routines_id_seq" CASCADE;
DROP SEQUENCE IF EXISTS "public"."routine_exercises_id_seq" CASCADE;
