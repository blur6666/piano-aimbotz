CREATE TABLE IF NOT EXISTS exercise_progress (
  exercise_id INTEGER PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
  initial_tempo_bpm INTEGER NOT NULL CHECK (initial_tempo_bpm > 0),
  current_tempo_bpm INTEGER NOT NULL CHECK (current_tempo_bpm > 0),
  consecutive_clean_runs INTEGER NOT NULL CHECK (consecutive_clean_runs >= 0)
);

INSERT INTO exercise_progress (exercise_id, initial_tempo_bpm, current_tempo_bpm, consecutive_clean_runs)
SELECT id, tempo_bpm, tempo_bpm, 0
FROM exercises
WHERE id NOT IN (SELECT exercise_id FROM exercise_progress);

ALTER TABLE exercises DROP COLUMN tempo_bpm;
