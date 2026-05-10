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
-- Self-healing dedupe BEFORE the index creation. Any environment
-- whose `sessions` table already had duplicate (user_id, date) rows
-- — produced by the race the index now closes — would otherwise
-- abort the migration with SQLSTATE 23505. The DELETE keeps the
-- earliest session per (user_id, date) on the conservative
-- assumption that the first insert is the user's intent and any
-- subsequent row is the race-induced duplicate. session_exercises
-- and exercise_sets are removed automatically via the FK cascades
-- declared on `session_id`.
DELETE FROM "public"."sessions" s
 USING "public"."sessions" earliest
 WHERE s.user_id = earliest.user_id
   AND s.date = earliest.date
   AND s.id > earliest.id;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_id_date_key
  ON "public"."sessions" (user_id, date);

-- migrate:down
DROP INDEX IF EXISTS sessions_user_id_date_key;
