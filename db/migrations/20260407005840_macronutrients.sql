-- migrate:up
ALTER TABLE "public"."users" alter column "created_at" set data type timestamp(3) without time zone USING "created_at"::timestamp(3) without time zone;
-- Enum cast for public.users.goal → Goal (from migra-postprocess.config.json)
ALTER TABLE "public"."users" ALTER COLUMN "goal" SET DATA TYPE "Goal" USING (
  CASE
    WHEN "goal" IS NULL THEN NULL::"Goal"
    WHEN trim(upper("goal"::text)) IN ('LOSE', 'LOSE_FAT', 'LOSE WEIGHT', 'WEIGHT_LOSS') THEN 'LOSE'::"Goal"
    WHEN trim(upper("goal"::text)) IN ('GAIN', 'GAIN_MUSCLE', 'MUSCLE_GAIN', 'BUILD') THEN 'GAIN'::"Goal"
    WHEN trim(upper("goal"::text)) IN ('MAINTAIN', 'MAINTENANCE', 'KEEP') THEN 'MAINTAIN'::"Goal"
    ELSE NULL::"Goal"
  END
);
-- Enum cast for public.users.sex → Sex (from migra-postprocess.config.json)
ALTER TABLE "public"."users" ALTER COLUMN "sex" SET DATA TYPE "Sex" USING (
  CASE
    WHEN "sex" IS NULL THEN NULL::"Sex"
    WHEN trim(upper("sex"::text)) IN ('MALE', 'M', 'MAN', 'HOMBRE') THEN 'MALE'::"Sex"
    WHEN trim(upper("sex"::text)) IN ('FEMALE', 'F', 'WOMAN', 'MUJER') THEN 'FEMALE'::"Sex"
    ELSE NULL::"Sex"
  END
);
ALTER TABLE "public"."users" alter column "updated_at" set data type timestamp(3) without time zone USING "updated_at"::timestamp(3) without time zone;

-- migrate:down
ALTER TABLE "public"."users" alter column "created_at" set DEFAULT now();
ALTER TABLE "public"."users" alter column "created_at" drop NOT NULL;
ALTER TABLE "public"."users" alter column "created_at" set data type timestamp without time zone USING "created_at"::timestamp without time zone;
ALTER TABLE "public"."users" alter column "goal" set data type character varying(100) USING "goal"::character varying(100);
ALTER TABLE "public"."users" alter column "sex" set data type text USING "sex"::text;
ALTER TABLE "public"."users" alter column "updated_at" set DEFAULT now();
ALTER TABLE "public"."users" alter column "updated_at" drop NOT NULL;
ALTER TABLE "public"."users" alter column "updated_at" set data type timestamp without time zone USING "updated_at"::timestamp without time zone;
