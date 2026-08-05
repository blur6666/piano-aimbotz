CREATE TABLE IF NOT EXISTS run_assessments (
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
  CHECK (timing_sample_count + timing_excluded_count <= 8),
  CHECK ((timing_sample_count = 0 AND mean_absolute_timing_deviation_us IS NULL) OR (timing_sample_count > 0 AND mean_absolute_timing_deviation_us IS NOT NULL))
);
