import {
  integer,
  sqliteTable,
  text,
  unique,
  check
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  direction: text('direction').notNull(),
  tonicPitchClass: integer('tonic_pitch_class').notNull()
})

export const exerciseProgress = sqliteTable('exercise_progress', {
  exerciseId: integer('exercise_id')
    .primaryKey()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  initialTempoBpm: integer('initial_tempo_bpm').notNull(),
  currentTempoBpm: integer('current_tempo_bpm').notNull(),
  consecutiveCleanRuns: integer('consecutive_clean_runs').notNull()
})

export const exerciseSteps = sqliteTable(
  'exercise_steps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    noteSpelling: text('note_spelling').notNull(),
    semitoneOffset: integer('semitone_offset').notNull(),
    fingerNumber: integer('finger_number').notNull()
  },
  (table) => [
    unique('exercise_step_index').on(table.exerciseId, table.stepIndex)
  ]
)

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  exerciseId: integer('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  performedAtMs: integer('performed_at_ms').notNull(),
  tempoBpm: integer('tempo_bpm').notNull()
})

export const midiEvents = sqliteTable(
  'midi_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    sequenceNumber: integer('sequence_number').notNull(),
    offsetUs: integer('offset_us').notNull(),
    eventType: text('event_type').notNull(),
    midiPitch: integer('midi_pitch').notNull(),
    velocity: integer('velocity').notNull()
  },
  (table) => [
    unique('run_event_sequence').on(table.runId, table.sequenceNumber)
  ]
)

export const runAssessments = sqliteTable(
  'run_assessments',
  {
    runId: integer('run_id')
      .primaryKey()
      .references(() => runs.id, { onDelete: 'cascade' }),
    algorithmVersion: text('algorithm_version').notNull(),
    scoringParameters: text('scoring_parameters').notNull(),
    progressionPolicyVersion: text('progression_policy_version').notNull(),
    progressionParameters: text('progression_parameters').notNull(),
    hardFaultCount: integer('hard_fault_count').notNull(),
    timingFaultCount: integer('timing_fault_count').notNull(),
    overlapFaultCount: integer('overlap_fault_count').notNull(),
    timingSampleCount: integer('timing_sample_count').notNull(),
    timingExcludedCount: integer('timing_excluded_count').notNull(),
    meanAbsoluteTimingDeviationUs: integer('mean_absolute_timing_deviation_us'),
    passed: integer('passed').notNull(),
    assessedAtMs: integer('assessed_at_ms').notNull()
  },
  (table) => [
    check(
      'run_assessments_timing_faults_le_samples',
      sql`${table.timingFaultCount} <= ${table.timingSampleCount}`
    ),
    check(
      'run_assessments_samples_plus_excluded_le_steps',
      sql`${table.timingSampleCount} + ${table.timingExcludedCount} <= 8`
    ),
    check(
      'run_assessments_mean_timing_null_when_no_samples',
      sql`(${table.timingSampleCount} = 0 AND ${table.meanAbsoluteTimingDeviationUs} IS NULL) OR (${table.timingSampleCount} > 0 AND ${table.meanAbsoluteTimingDeviationUs} IS NOT NULL)`
    )
  ]
)
