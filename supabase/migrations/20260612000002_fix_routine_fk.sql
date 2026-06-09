-- QA1-B9: job_runs.routine_id FK had no ON DELETE SET NULL, so deleting a
-- routine that has any run history failed with a FK constraint violation.
-- SET NULL preserves run history; the routine link simply becomes null.
ALTER TABLE job_runs DROP CONSTRAINT IF EXISTS job_runs_routine_id_fkey;
ALTER TABLE job_runs
  ADD CONSTRAINT job_runs_routine_id_fkey
  FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE SET NULL;
