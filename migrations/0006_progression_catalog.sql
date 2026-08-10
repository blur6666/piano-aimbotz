-- Introduces progression_groups and scales per docs/ARCHITECTURE.md's ERD, and
-- moves scale identity (slug, display name, tonic pitch class) off
-- exercises onto scales. exercises becomes (id, scale_id, direction) only.
-- This is the rebuild the full 12-scale/24-exercise catalog needs
-- (BACKLOG.md); the seed command inserts the remaining 11 scales and 22
-- exercises afterward through the normal validated catalog path. Existing
-- exercise ids are preserved here so historical runs keep referencing the
-- same exercise.

CREATE TABLE IF NOT EXISTS progression_groups (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  progression_order INTEGER NOT NULL UNIQUE CHECK (progression_order > 0)
);

CREATE TABLE IF NOT EXISTS scales (
  id INTEGER PRIMARY KEY,
  progression_group_id INTEGER NOT NULL REFERENCES progression_groups(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL UNIQUE,
  tonic_pitch_class INTEGER NOT NULL UNIQUE CHECK (tonic_pitch_class BETWEEN 0 AND 11),
  position_in_group INTEGER NOT NULL CHECK (position_in_group > 0),
  UNIQUE (progression_group_id, position_in_group)
);

-- The only scale/group data this migration creates directly: whatever is
-- already referenced by existing exercises. The catalog seed inserts the
-- remaining scales and groups; its slug/name/order for this group and
-- scale must match exactly, or the seed's no-silent-update check fails.
INSERT INTO progression_groups (slug, name, progression_order)
VALUES ('group-1', 'Group 1 — shared fingering', 1);

INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group)
SELECT id, 'c-major', 'C major', 0, 1 FROM progression_groups WHERE slug = 'group-1';

CREATE TABLE exercises_new (
  id INTEGER PRIMARY KEY,
  scale_id INTEGER NOT NULL REFERENCES scales(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('ascending', 'descending')),
  UNIQUE (scale_id, direction)
);

INSERT INTO exercises_new (id, scale_id, direction)
SELECT e.id, s.id, e.direction
FROM exercises e
JOIN scales s ON s.tonic_pitch_class = e.tonic_pitch_class;

DROP TABLE exercises;

ALTER TABLE exercises_new RENAME TO exercises;
