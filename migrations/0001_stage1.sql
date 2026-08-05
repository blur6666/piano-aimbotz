CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ascending')),
  tonic_pitch_class INTEGER NOT NULL CHECK (tonic_pitch_class BETWEEN 0 AND 11),
  tempo_bpm INTEGER NOT NULL CHECK (tempo_bpm > 0)
);

CREATE TABLE IF NOT EXISTS exercise_steps (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index BETWEEN 0 AND 7),
  note_spelling TEXT NOT NULL CHECK (length(note_spelling) > 0),
  semitone_offset INTEGER NOT NULL CHECK (semitone_offset BETWEEN 0 AND 12),
  finger_number INTEGER NOT NULL CHECK (finger_number BETWEEN 1 AND 5),
  UNIQUE (exercise_id, step_index)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  performed_at_ms INTEGER NOT NULL CHECK (performed_at_ms >= 0),
  tempo_bpm INTEGER NOT NULL CHECK (tempo_bpm > 0)
);

CREATE TABLE IF NOT EXISTS midi_events (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
  offset_us INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('note_on', 'note_off')),
  midi_pitch INTEGER NOT NULL CHECK (midi_pitch BETWEEN 0 AND 127),
  velocity INTEGER NOT NULL CHECK (velocity BETWEEN 0 AND 127),
  UNIQUE (run_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS runs_exercise_performed_idx
  ON runs (exercise_id, performed_at_ms DESC, id DESC);
