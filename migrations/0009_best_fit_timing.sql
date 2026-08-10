-- Stage 3 scores timing as residual unevenness around each run's fitted line.
-- Preserve the fitted intercept too, so the user can see consistent start lag
-- without it being charged as a timing fault.
ALTER TABLE run_assessments
ADD COLUMN timing_start_offset_us INTEGER;
