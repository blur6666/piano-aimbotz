-- The beat grid a run was played against is a property of the run, not of
-- the current configuration. Runs recorded before this migration were all
-- played one note per beat, so the default backfills them truthfully and
-- re-scoring them from raw events stays correct after the default for new
-- runs changes to two notes per beat (straight eighths).
ALTER TABLE runs
  ADD COLUMN notes_per_beat INTEGER NOT NULL DEFAULT 1
  CHECK (notes_per_beat IN (1, 2));
