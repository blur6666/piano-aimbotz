-- Corrects E-flat major right-hand fingering to the resolved source of
-- record (docs/SCALES_FINGERING_REFERENCE.md): ascending starts on finger 3,
-- not 2, and descending (its exact reverse) ends on finger 3. Only these
-- two cells change.
--
-- Each UPDATE is guarded by the superseded finger value, so it is a no-op
-- on databases that never held the old fingering -- including fresh
-- databases, where migrations run before the seed inserts the corrected
-- steps. No historical runs reference these exercises, so the catalog
-- immutability rule is not violated. The seed's no-silent-update check
-- remains the guard against any other unexpected state.

UPDATE exercise_steps
SET finger_number = 3
WHERE finger_number = 2
  AND step_index = 0
  AND exercise_id = (
    SELECT e.id
    FROM exercises e
    JOIN scales s ON s.id = e.scale_id
    WHERE s.slug = 'e-flat-major' AND e.direction = 'ascending'
  );

UPDATE exercise_steps
SET finger_number = 3
WHERE finger_number = 2
  AND step_index = 7
  AND exercise_id = (
    SELECT e.id
    FROM exercises e
    JOIN scales s ON s.id = e.scale_id
    WHERE s.slug = 'e-flat-major' AND e.direction = 'descending'
  );
