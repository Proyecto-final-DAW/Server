-- migrate:up
create type "public"."Sex" as enum ('MALE', 'FEMALE');

-- migrate:down
DROP TYPE IF EXISTS "public"."Sex" CASCADE;
