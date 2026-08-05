-- Widens the direction check to match the ascending|descending contract
-- used throughout the domain/API types. The seed data and catalog still
-- only create ascending exercises for now (full 12-scale/24-exercise
-- catalog with descending pairs is a later stage); this only removes a
-- schema restriction that no longer matches what the scorer already
-- supports.
CREATE TABLE exercises_new (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ascending', 'descending')),
  tonic_pitch_class INTEGER NOT NULL CHECK (tonic_pitch_class BETWEEN 0 AND 11)
);

INSERT INTO exercises_new (id, slug, name, direction, tonic_pitch_class)
SELECT id, slug, name, direction, tonic_pitch_class FROM exercises;

DROP TABLE exercises;

ALTER TABLE exercises_new RENAME TO exercises;
