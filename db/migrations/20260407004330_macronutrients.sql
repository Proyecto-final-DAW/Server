-- migrate:up
create type "public"."Goal" as enum ('LOSE', 'GAIN', 'MAINTAIN');

-- migrate:down
-- Revert changes manually if needed
-- Review the SQL above to create the appropriate rollback
