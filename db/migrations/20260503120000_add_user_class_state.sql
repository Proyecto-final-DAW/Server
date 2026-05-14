-- migrate:up

-- Idempotent guards: a previous (broken) attempt of this migration may have
-- left a partial type or table behind. Cleaning up first lets the migration
-- run successfully against any leftover state without manual intervention.
DROP TABLE IF EXISTS "public"."user_class_state" CASCADE;
DROP TYPE IF EXISTS "public"."ClassTierStage";

CREATE TYPE "public"."ClassTierStage" AS ENUM ('NORMAL', 'TRANSCENDENT');

CREATE TABLE "public"."user_class_state" (
    "user_id"                 integer       NOT NULL,
    "current_tier"            smallint      NOT NULL DEFAULT 0,
    "vocation_class_id"       varchar(50),
    "specialization_class_id" varchar(50),
    "legendary_class_id"      varchar(50),
    "legendary_stage"         "ClassTierStage",
    "is_maestro_supremo"      boolean       NOT NULL DEFAULT false,
    "is_leyenda"              boolean       NOT NULL DEFAULT false,
    "pending_choice_tier"     smallint,
    "created_at"              timestamptz   NOT NULL DEFAULT NOW(),
    "updated_at"              timestamptz   NOT NULL DEFAULT NOW(),
    CONSTRAINT "user_class_state_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_class_state_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "user_class_state_current_tier_check"
        CHECK ("current_tier" BETWEEN 0 AND 6),
    CONSTRAINT "user_class_state_pending_choice_tier_check"
        CHECK ("pending_choice_tier" IS NULL OR "pending_choice_tier" IN (1, 2, 3))
);

-- Sparse index: lookups for "users with a pending choice" (e.g. nudge jobs) skip
-- the dominant NULL rows.
CREATE INDEX "user_class_state_pending_choice_tier_idx"
    ON "public"."user_class_state" ("pending_choice_tier")
    WHERE "pending_choice_tier" IS NOT NULL;

-- migrate:down
DROP TABLE IF EXISTS "public"."user_class_state" CASCADE;
DROP TYPE IF EXISTS "public"."ClassTierStage";
