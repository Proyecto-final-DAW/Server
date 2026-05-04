-- migrate:up

-- Convert users.equipment from scalar Equipment to Equipment[] so users can
-- pick multiple equipment options during onboarding (e.g. "FULL_GYM" plus
-- "HOME_WEIGHTS"). The onboarding wizard, validator and service already
-- treated this as an array — the column was the only thing left to align.
ALTER TABLE "public"."users"
  ALTER COLUMN "equipment" TYPE "public"."Equipment"[]
  USING (
    CASE
      WHEN "equipment" IS NULL THEN ARRAY[]::"public"."Equipment"[]
      ELSE ARRAY["equipment"]
    END
  );

ALTER TABLE "public"."users"
  ALTER COLUMN "equipment" SET DEFAULT ARRAY[]::"public"."Equipment"[];


-- migrate:down

ALTER TABLE "public"."users"
  ALTER COLUMN "equipment" DROP DEFAULT;

ALTER TABLE "public"."users"
  ALTER COLUMN "equipment" TYPE "public"."Equipment"
  USING (
    CASE
      WHEN array_length("equipment", 1) IS NULL THEN NULL
      ELSE "equipment"[1]
    END
  );
