-- Migration 0001 constrained semitone_offset to 0..12, which only fits
-- ascending exercises. ARCHITECTURE.md specifies -12..12 so a descending
-- exercise's step 7 (offset -12) is storable. Migration 0004 widened
-- exercises.direction to accept 'descending' but missed this column,
-- which would have failed a descending seed mid-insert with a CHECK error.
CREATE TABLE exercise_steps_new (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index BETWEEN 0 AND 7),
  note_spelling TEXT NOT NULL CHECK (length(note_spelling) > 0),
  semitone_offset INTEGER NOT NULL CHECK (semitone_offset BETWEEN -12 AND 12),
  finger_number INTEGER NOT NULL CHECK (finger_number BETWEEN 1 AND 5),
  UNIQUE (exercise_id, step_index)
);

INSERT INTO exercise_steps_new (
  id, exercise_id, step_index, note_spelling, semitone_offset, finger_number
)
SELECT id, exercise_id, step_index, note_spelling, semitone_offset, finger_number
FROM exercise_steps;

DROP TABLE exercise_steps;

ALTER TABLE exercise_steps_new RENAME TO exercise_steps;
