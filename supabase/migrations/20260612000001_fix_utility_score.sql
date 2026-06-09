-- QA1-B8: The live DB has a NOT NULL constraint on memories.utility_score
-- that contradicts the schema intent. utility_score is computed later by the
-- decay cron job — it must be nullable on insert.
ALTER TABLE memories ALTER COLUMN utility_score DROP NOT NULL;
