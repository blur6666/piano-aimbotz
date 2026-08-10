import type Database from 'better-sqlite3'
import { scoreRun } from '../../domain/scoring.js'
import type { AppConfig } from '../config.js'
import { ALGORITHM_VERSION } from './create-run.js'
import { NotFoundError } from './errors.js'

type RunRow = {
  id: number
  exercise_id: number
  performed_at_ms: number
  tempo_bpm: number
  notes_per_beat: number
}

type AssessmentRow = {
  algorithm_version: string
  scoring_parameters: string
  progression_policy_version: string
  progression_parameters: string
  hard_fault_count: number
  timing_fault_count: number
  overlap_fault_count: number
  timing_sample_count: number
  timing_excluded_count: number
  mean_absolute_timing_deviation_us: number | null
  timing_start_offset_us: number | null
  passed: number
  assessed_at_ms: number
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

export function readRun(
  sqlite: Database.Database,
  config: AppConfig,
  runId: number
) {
  const run = sqlite
    .prepare(
      'SELECT id, exercise_id, performed_at_ms, tempo_bpm, notes_per_beat FROM runs WHERE id = ?'
    )
    .get(runId) as RunRow | undefined
  if (!run) throw new NotFoundError('Run not found.')

  const originalAssessment = sqlite
    .prepare('SELECT * FROM run_assessments WHERE run_id = ?')
    .get(runId) as AssessmentRow | undefined
  // Every persisted run gets exactly one original assessment, written in
  // the same transaction as the run itself (ARCHITECTURE.md); a missing
  // one is a genuine data-integrity bug, not a "not found" run.
  if (!originalAssessment)
    throw new Error(`Missing run_assessments row for run ${runId}`)

  const exercise = sqlite
    .prepare(
      `SELECT e.direction, s.tonic_pitch_class
       FROM exercises e
       JOIN scales s ON s.id = e.scale_id
       WHERE e.id = ?`
    )
    .get(run.exercise_id) as ExerciseRow
  const steps = sqlite
    .prepare(
      'SELECT step_index, semitone_offset, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
    )
    .all(run.exercise_id) as StepRow[]
  const events = sqlite
    .prepare(
      'SELECT sequence_number, offset_us, event_type, midi_pitch, velocity FROM midi_events WHERE run_id = ? ORDER BY sequence_number'
    )
    .all(runId) as EventRow[]

  const currentAssessment = scoreRun({
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
    // The grid the run was actually played against, not the current
    // configuration -- re-scoring an old run must not silently rewrite the
    // beat spacing it was performed on.
    notesPerBeat: run.notes_per_beat,
    events: events.map((event) => ({
      sequenceNumber: event.sequence_number,
      offsetUs: event.offset_us,
      type: event.event_type,
      midiPitch: event.midi_pitch,
      velocity: event.velocity
    })),
    config: config.scoring,
    algorithmVersion: ALGORITHM_VERSION
  })

  return {
    run: {
      id: run.id,
      exerciseId: run.exercise_id,
      firstExpectedBeatAtMs: run.performed_at_ms,
      tempoBpm: run.tempo_bpm
    },
    originalAssessment: {
      algorithmVersion: originalAssessment.algorithm_version,
      scoringParameters: JSON.parse(originalAssessment.scoring_parameters),
      progressionPolicyVersion: originalAssessment.progression_policy_version,
      progressionParameters: JSON.parse(
        originalAssessment.progression_parameters
      ),
      assessedAtMs: originalAssessment.assessed_at_ms,
      summary: {
        hardFaultCount: originalAssessment.hard_fault_count,
        timingFaultCount: originalAssessment.timing_fault_count,
        overlapFaultCount: originalAssessment.overlap_fault_count,
        timingSampleCount: originalAssessment.timing_sample_count,
        timingExcludedCount: originalAssessment.timing_excluded_count,
        meanAbsoluteTimingDeviationUs:
          originalAssessment.mean_absolute_timing_deviation_us,
        timingStartOffsetUs: originalAssessment.timing_start_offset_us,
        passed: originalAssessment.passed === 1
      }
    },
    currentAssessment
  }
}

type HistoryRow = {
  id: number
  performed_at_ms: number
  tempo_bpm: number
  algorithm_version: string
  hard_fault_count: number
  timing_fault_count: number
  overlap_fault_count: number
  timing_sample_count: number
  timing_excluded_count: number
  mean_absolute_timing_deviation_us: number | null
  timing_start_offset_us: number | null
  passed: number
}

export function listRuns(sqlite: Database.Database, exerciseId: number) {
  const rows = sqlite
    .prepare(
      `SELECT r.id, r.performed_at_ms, r.tempo_bpm,
              a.algorithm_version, a.hard_fault_count, a.timing_fault_count, a.overlap_fault_count,
               a.timing_sample_count, a.timing_excluded_count, a.mean_absolute_timing_deviation_us, a.timing_start_offset_us, a.passed
       FROM runs r
       JOIN run_assessments a ON a.run_id = r.id
       WHERE r.exercise_id = ?
       ORDER BY r.performed_at_ms DESC, r.id DESC`
    )
    .all(exerciseId) as HistoryRow[]

  return {
    runs: rows.map((row) => ({
      id: row.id,
      firstExpectedBeatAtMs: row.performed_at_ms,
      tempoBpm: row.tempo_bpm,
      originalAssessment: {
        algorithmVersion: row.algorithm_version,
        hardFaultCount: row.hard_fault_count,
        timingFaultCount: row.timing_fault_count,
        overlapFaultCount: row.overlap_fault_count,
        timingSampleCount: row.timing_sample_count,
        timingExcludedCount: row.timing_excluded_count,
        meanAbsoluteTimingDeviationUs: row.mean_absolute_timing_deviation_us,
        timingStartOffsetUs: row.timing_start_offset_us,
        passed: row.passed === 1
      }
    }))
  }
}
