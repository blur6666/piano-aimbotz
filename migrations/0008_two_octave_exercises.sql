-- Two-octave exercises are 15 steps spanning 24 semitones, not 8 spanning 12.
-- Four constraints assumed one octave of eight steps. SQLite cannot ALTER a
-- CHECK, so each affected table is rebuilt (CREATE new / copy / DROP old /
-- RENAME), the same pattern migrations 0005 and 0006 already use.
--
-- exercises.octaves defaults to 1 so the 24 existing exercises backfill
-- truthfully -- every one of them was played a single octave -- exactly as
-- 0007 did for notes_per_beat.

CREATE TABLE exercises_new (
  id INTEGER PRIMARY KEY,
  scale_id INTEGER NOT NULL REFERENCES scales(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('ascending', 'descending')),
  octaves INTEGER NOT NULL DEFAULT 1 CHECK (octaves IN (1, 2)),
  UNIQUE (scale_id, direction, octaves)
);

INSERT INTO exercises_new (id, scale_id, direction, octaves)
SELECT id, scale_id, direction, 1 FROM exercises;

DROP TABLE exercises;

ALTER TABLE exercises_new RENAME TO exercises;

CREATE TABLE exercise_steps_new (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index BETWEEN 0 AND 14),
  note_spelling TEXT NOT NULL CHECK (length(note_spelling) > 0),
  semitone_offset INTEGER NOT NULL CHECK (semitone_offset BETWEEN -24 AND 24),
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

CREATE TABLE run_assessments_new (
  run_id INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  algorithm_version TEXT NOT NULL CHECK (length(algorithm_version) > 0),
  scoring_parameters TEXT NOT NULL CHECK (json_valid(scoring_parameters) AND json_type(scoring_parameters) = 'object'),
  progression_policy_version TEXT NOT NULL CHECK (length(progression_policy_version) > 0),
  progression_parameters TEXT NOT NULL CHECK (json_valid(progression_parameters) AND json_type(progression_parameters) = 'object'),
  hard_fault_count INTEGER NOT NULL CHECK (hard_fault_count >= 0),
  timing_fault_count INTEGER NOT NULL CHECK (timing_fault_count >= 0),
  overlap_fault_count INTEGER NOT NULL CHECK (overlap_fault_count >= 0),
  timing_sample_count INTEGER NOT NULL CHECK (timing_sample_count >= 0),
  timing_excluded_count INTEGER NOT NULL CHECK (timing_excluded_count >= 0),
  mean_absolute_timing_deviation_us INTEGER CHECK (mean_absolute_timing_deviation_us IS NULL OR mean_absolute_timing_deviation_us >= 0),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  assessed_at_ms INTEGER NOT NULL CHECK (assessed_at_ms >= 0),
  CHECK (timing_fault_count <= timing_sample_count),
  CHECK (timing_sample_count + timing_excluded_count <= 15),
  CHECK ((timing_sample_count = 0 AND mean_absolute_timing_deviation_us IS NULL) OR (timing_sample_count > 0 AND mean_absolute_timing_deviation_us IS NOT NULL))
);

INSERT INTO run_assessments_new SELECT * FROM run_assessments;

DROP TABLE run_assessments;

ALTER TABLE run_assessments_new RENAME TO run_assessments;
