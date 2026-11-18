-- Time-clock invariants enforced by the API are also protected in PostgreSQL,
-- including writes made by maintenance scripts or future services.
-- Serialize this migration across serverless instances; the lock is released
-- when the schema file's query transaction commits.
LOCK TABLE attendance_sessions, attendance_breaks IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_attendance_sessions_clock_order'
      AND conrelid = 'attendance_sessions'::regclass
  ) THEN
    ALTER TABLE attendance_sessions
      ADD CONSTRAINT ck_attendance_sessions_clock_order
      CHECK (clock_out IS NULL OR clock_out > clock_in) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_attendance_breaks_time_order'
      AND conrelid = 'attendance_breaks'::regclass
  ) THEN
    ALTER TABLE attendance_breaks
      ADD CONSTRAINT ck_attendance_breaks_time_order
      CHECK ("end" IS NULL OR "end" > "start") NOT VALID;
  END IF;
END;
$$;

ALTER TABLE attendance_sessions
  VALIDATE CONSTRAINT ck_attendance_sessions_clock_order;
ALTER TABLE attendance_breaks
  VALIDATE CONSTRAINT ck_attendance_breaks_time_order;

-- This index also serves the open-session lookup used by the workforce view.
DROP INDEX IF EXISTS idx_attendance_sessions_open;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_sessions_one_open
  ON attendance_sessions (user_id)
  WHERE clock_out IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_breaks_one_open
  ON attendance_breaks (session_id)
  WHERE "end" IS NULL;
