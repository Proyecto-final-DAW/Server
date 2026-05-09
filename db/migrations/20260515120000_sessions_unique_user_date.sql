-- migrate:up

-- Enforces "one session per day per user" at the DB level. The
-- application layer already does a SELECT pre-check + 409, but the
-- SELECT is not transactional, so two concurrent saves (two tabs, a
-- double-tap that bypasses the client gate, retry storm) can both pass
-- the check and double-insert — corrupting streak/XP and the daily
-- caps. This UNIQUE catches the race; SessionController.create now
-- listens for SQLSTATE 23505 on the INSERT and returns the same
-- SESSION_ALREADY_LOGGED_TODAY 409 the pre-check returns.
--
-- Pre-existing duplicate rows would block the index creation. We
-- assume none — the app rule has been in place since launch — but if
-- the migration aborts, the cleanup query lives in the comment below
-- and should be applied once before retrying:
--
--   DELETE FROM sessions s USING sessions older
--   WHERE s.user_id = older.user_id
--     AND s.date = older.date
--     AND s.id > older.id;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_id_date_key
  ON "public"."sessions" (user_id, date);

-- migrate:down
DROP INDEX IF EXISTS sessions_user_id_date_key;
