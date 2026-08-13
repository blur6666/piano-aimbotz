-- Makes the practice trail a first-class object in the schema.
--
-- The trail was already fully determined by progression_groups.progression_order
-- and scales.position_in_group, but only implicitly: reading it meant knowing to
-- write the right join and the right ORDER BY, so "what is the path through
-- world 1?" lived in whoever wrote the query rather than in the database. This
-- view states the path instead of leaving it to be reassembled.
--
-- A view, not a table: it stores no rows, so it cannot disagree with the scales
-- and groups the catalog seed inserted. Materialising the same ordering a second
-- time would create exactly the drift the ordinal columns exist to prevent. If a
-- trail step ever needs data of its own that no scale carries, that is when this
-- becomes a real table -- and that migration should be justified by the new
-- column, not by wanting the trail to look tangible.
--
-- steps_in_world and is_final_step are the point of the exercise: the last step
-- of a world announces itself. Completion is read off the row, never inferred
-- from a missing successor, so no consumer has to chase pointers to discover it
-- has arrived. The clear condition -- what completing a step demands of the
-- player -- deliberately does not appear here; docs/SPEC.md keeps it a
-- placeholder constant, and constants belong in configuration, not in schema.

CREATE VIEW IF NOT EXISTS trail AS
SELECT
  g.progression_order AS world_number,
  g.slug AS world_slug,
  g.name AS world_name,
  s.position_in_group AS step_number,
  count(*) OVER (PARTITION BY g.id) AS steps_in_world,
  CASE
    WHEN s.position_in_group = count(*) OVER (PARTITION BY g.id) THEN 1
    ELSE 0
  END AS is_final_step,
  s.id AS scale_id,
  s.slug AS node_slug,
  s.display_name AS node_name
FROM progression_groups g
JOIN scales s ON s.progression_group_id = g.id
ORDER BY g.progression_order, s.position_in_group;
