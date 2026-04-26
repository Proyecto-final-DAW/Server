-- migrate:up

ALTER TABLE "public"."sessions" DROP COLUMN IF EXISTS "exercises";
ALTER TABLE "public"."sessions" ADD COLUMN IF NOT EXISTS "date" date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE "public"."sessions" ADD COLUMN IF NOT EXISTS "routine_id" integer;
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_routine_id_fkey" FOREIGN KEY (routine_id) REFERENCES routines(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
ALTER TABLE "public"."sessions" VALIDATE CONSTRAINT "sessions_routine_id_fkey";
CREATE INDEX IF NOT EXISTS sessions_user_id_date_idx ON public.sessions USING btree (user_id, date);

CREATE TYPE "public"."ExerciseType" AS ENUM ('strength', 'cardio', 'explosive', 'stretch');

CREATE SEQUENCE "public"."session_exercises_id_seq";
CREATE TABLE "public"."session_exercises" (
    "id" integer NOT NULL DEFAULT nextval('session_exercises_id_seq'::regclass),
    "session_id" integer NOT NULL,
    "exercise_api_id" varchar(50) NOT NULL,
    "name" varchar(200) NOT NULL,
    "type" "public"."ExerciseType" NOT NULL,
    "order_index" integer NOT NULL
);
ALTER SEQUENCE "public"."session_exercises_id_seq" OWNED BY "public"."session_exercises"."id";
CREATE UNIQUE INDEX session_exercises_pkey ON public.session_exercises USING btree (id);
CREATE INDEX session_exercises_session_id_idx ON public.session_exercises USING btree (session_id);
ALTER TABLE "public"."session_exercises" ADD CONSTRAINT "session_exercises_pkey" PRIMARY KEY USING INDEX "session_exercises_pkey";
ALTER TABLE "public"."session_exercises" ADD CONSTRAINT "session_exercises_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."session_exercises" VALIDATE CONSTRAINT "session_exercises_session_id_fkey";

CREATE SEQUENCE "public"."exercise_sets_id_seq";
CREATE TABLE "public"."exercise_sets" (
    "id" integer NOT NULL DEFAULT nextval('exercise_sets_id_seq'::regclass),
    "session_exercise_id" integer NOT NULL,
    "reps" integer NOT NULL,
    "weight" numeric(6, 2) NOT NULL,
    "order_index" integer NOT NULL
);
ALTER SEQUENCE "public"."exercise_sets_id_seq" OWNED BY "public"."exercise_sets"."id";
CREATE UNIQUE INDEX exercise_sets_pkey ON public.exercise_sets USING btree (id);
CREATE INDEX exercise_sets_session_exercise_id_idx ON public.exercise_sets USING btree (session_exercise_id);
ALTER TABLE "public"."exercise_sets" ADD CONSTRAINT "exercise_sets_pkey" PRIMARY KEY USING INDEX "exercise_sets_pkey";
ALTER TABLE "public"."exercise_sets" ADD CONSTRAINT "exercise_sets_session_exercise_id_fkey" FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
ALTER TABLE "public"."exercise_sets" VALIDATE CONSTRAINT "exercise_sets_session_exercise_id_fkey";

-- migrate:down
DROP TABLE IF EXISTS "public"."exercise_sets" CASCADE;
DROP SEQUENCE IF EXISTS "public"."exercise_sets_id_seq" CASCADE;
DROP TABLE IF EXISTS "public"."session_exercises" CASCADE;
DROP SEQUENCE IF EXISTS "public"."session_exercises_id_seq" CASCADE;
DROP TYPE IF EXISTS "public"."ExerciseType";
ALTER TABLE "public"."sessions" DROP CONSTRAINT IF EXISTS "sessions_routine_id_fkey";
DROP INDEX IF EXISTS public.sessions_user_id_date_idx;
ALTER TABLE "public"."sessions" DROP COLUMN IF EXISTS "routine_id";
ALTER TABLE "public"."sessions" DROP COLUMN IF EXISTS "date";
ALTER TABLE "public"."sessions" ADD COLUMN IF NOT EXISTS "exercises" jsonb NOT NULL DEFAULT '[]'::jsonb;
