import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { openSqlite } from './connection.js'
import { loadConfig, type AppConfig } from '../config.js'
import { scoreRun } from '../../domain/scoring.js'
import { CURRENT_PROGRESSION_VERSION } from '../../domain/progression/index.js'
import { rebuildExerciseProgress } from '../progress/rebuild.js'

// Runs captured before run_assessments existed (or before this column set
// existed) have no matching assessment row. readRun() and listRuns() both
// assume every run has exactly one, per ARCHITECTURE.md's invariant. This
// restores that invariant for pre-existing data by scoring those runs with
// the current algorithm, rather than teaching every reader to tolerate a
// missing assessment. The distinct algorithm version makes clear these were
// recomputed after the fact, not captured at submission time.
export const LEGACY_BACKFILL_ALGORITHM_VERSION = 'stage1-backfill'

type MissingRunRow = {
  id: number
  exercise_id: number
  tempo_bpm: number
}

type ExerciseRow = {
  direction: string
  tonic_pitch_class: number
}

type StepRow = {
  step_index: number
  semitone_offset: number
  finger_number: number
}

type EventRow = {
  sequence_number: number
  offset_us: number
  event_type: 'note_on' | 'note_off'
  midi_pitch: number
  velocity: number
}

export function backfillMissingAssessments(
  sqlite: Database.Database,
  config: AppConfig
): number[] {
  const missing = sqlite
    .prepare(
      `SELECT r.id, r.exercise_id, r.tempo_bpm
       FROM runs r
       LEFT JOIN run_assessments a ON a.run_id = r.id
       WHERE a.run_id IS NULL
       ORDER BY r.id ASC`
    )
    .all() as MissingRunRow[]

  const affectedExerciseIds = new Set<number>()
  const backfilledRunIds: number[] = []

  const insertAssessment = sqlite.prepare(
    'INSERT INTO run_assessments (run_id, algorithm_version, scoring_parameters, progression_policy_version, progression_parameters, hard_fault_count, timing_fault_count, overlap_fault_count, timing_sample_count, timing_excluded_count, mean_absolute_timing_deviation_us, passed, assessed_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )

  for (const run of missing) {
    const exercise = sqlite
      .prepare(
        'SELECT direction, tonic_pitch_class FROM exercises WHERE id = ?'
      )
      .get(run.exercise_id) as ExerciseRow | undefined
    // The exercise itself is gone; there is nothing sane to score against.
    if (!exercise) continue

    const steps = sqlite
      .prepare(
        'SELECT step_index, semitone_offset, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
      )
      .all(run.exercise_id) as StepRow[]
    const events = sqlite
      .prepare(
        'SELECT sequence_number, offset_us, event_type, midi_pitch, velocity FROM midi_events WHERE run_id = ? ORDER BY sequence_number'
      )
      .all(run.id) as EventRow[]

    const assessment = scoreRun({
      exercise: {
        direction: exercise.direction as 'ascending' | 'descending',
        tonicPitchClass: exercise.tonic_pitch_class,
        steps: steps.map((step) => ({
          stepIndex: step.step_index,
          semitoneOffset: step.semitone_offset,
          fingerNumber: step.finger_number
        }))
      },
      tempoBpm: run.tempo_bpm,
      events: events.map((event) => ({
        sequenceNumber: event.sequence_number,
        offsetUs: event.offset_us,
        type: event.event_type,
        midiPitch: event.midi_pitch,
        velocity: event.velocity
      })),
      config: config.scoring,
      algorithmVersion: LEGACY_BACKFILL_ALGORITHM_VERSION
    })

    const summary = assessment.summary
    insertAssessment.run(
      run.id,
      assessment.algorithmVersion,
      JSON.stringify(assessment.scoringParameters),
      CURRENT_PROGRESSION_VERSION,
      JSON.stringify(config.progression),
      summary.hardFaultCount,
      summary.timingFaultCount,
      summary.overlapFaultCount,
      summary.timingSampleCount,
      summary.timingExcludedCount,
      summary.meanAbsoluteTimingDeviationUs,
      summary.passed ? 1 : 0,
      Date.now()
    )
    affectedExerciseIds.add(run.exercise_id)
    backfilledRunIds.push(run.id)
  }

  for (const exerciseId of affectedExerciseIds)
    rebuildExerciseProgress(sqlite, exerciseId)

  return backfilledRunIds
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const config = loadConfig()
  const sqlite = openSqlite()
  const backfilled = backfillMissingAssessments(sqlite, config)
  if (backfilled.length > 0)
    console.log(`Backfilled assessments for runs: ${backfilled.join(', ')}`)
  sqlite.close()
}
