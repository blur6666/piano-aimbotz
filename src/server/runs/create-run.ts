import type Database from 'better-sqlite3'
import { scoreRun } from '../../domain/scoring.js'
import {
  applyProgressionVersion,
  CURRENT_PROGRESSION_VERSION
} from '../../domain/progression/index.js'
import type { AppConfig } from '../config.js'
import type { SubmitRun } from '../../shared/contracts.js'
import {
  NotFoundError,
  StaleTempoError,
  InvalidSequenceError,
  InvalidEventError
} from './errors.js'

export const ALGORITHM_VERSION = 'stage3-best-fit-line'

type ExerciseRow = {
  id: number
  direction: string
  tonic_pitch_class: number
}

type StepRow = {
  step_index: number
  semitone_offset: number
  finger_number: number
}

type ProgressRow = {
  initial_tempo_bpm: number
  current_tempo_bpm: number
  consecutive_clean_runs: number
}

export function createRun(
  sqlite: Database.Database,
  config: AppConfig,
  body: SubmitRun
) {
  for (let index = 0; index < body.events.length; index += 1) {
    const event = body.events[index]
    if (event.sequenceNumber !== index)
      throw new InvalidSequenceError(
        'Event sequence numbers must start at zero and be contiguous.'
      )
    if (event.type === 'note_on' && event.velocity === 0)
      throw new InvalidEventError(
        'note_on events with velocity zero must already be normalized to note_off.'
      )
  }

  const exercise = sqlite
    .prepare(
      `SELECT e.id, e.direction, s.tonic_pitch_class
       FROM exercises e
       JOIN scales s ON s.id = e.scale_id
       WHERE e.id = ?`
    )
    .get(body.exerciseId) as ExerciseRow | undefined
  if (!exercise) throw new NotFoundError('Exercise not found.')

  const progress = sqlite
    .prepare(
      'SELECT initial_tempo_bpm, current_tempo_bpm, consecutive_clean_runs FROM exercise_progress WHERE exercise_id = ?'
    )
    .get(exercise.id) as ProgressRow | undefined
  if (!progress) throw new NotFoundError('Exercise not found.')

  if (body.tempoBpm !== progress.current_tempo_bpm)
    throw new StaleTempoError(progress.current_tempo_bpm)

  const steps = sqlite
    .prepare(
      'SELECT step_index, semitone_offset, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
    )
    .all(exercise.id) as StepRow[]

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
    tempoBpm: body.tempoBpm,
    // The client never chooses the beat grid; the server applies its own
    // configured value and records it on the run, the same way the tempo is
    // validated rather than trusted.
    notesPerBeat: config.notesPerBeat,
    events: body.events,
    config: config.scoring,
    algorithmVersion: ALGORITHM_VERSION
  })

  const transaction = sqlite.transaction(() => {
    const result = sqlite
      .prepare(
        'INSERT INTO runs (exercise_id, performed_at_ms, tempo_bpm, notes_per_beat) VALUES (?, ?, ?, ?)'
      )
      .run(
        body.exerciseId,
        body.firstExpectedBeatAtMs,
        body.tempoBpm,
        config.notesPerBeat
      )
    const runId = Number(result.lastInsertRowid)

    const insertEvent = sqlite.prepare(
      'INSERT INTO midi_events (run_id, sequence_number, offset_us, event_type, midi_pitch, velocity) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (const event of body.events)
      insertEvent.run(
        runId,
        event.sequenceNumber,
        event.offsetUs,
        event.type,
        event.midiPitch,
        event.velocity
      )

    const summary = assessment.summary
    sqlite
      .prepare(
        'INSERT INTO run_assessments (run_id, algorithm_version, scoring_parameters, progression_policy_version, progression_parameters, hard_fault_count, timing_fault_count, overlap_fault_count, timing_sample_count, timing_excluded_count, mean_absolute_timing_deviation_us, timing_start_offset_us, passed, assessed_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        runId,
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
        summary.timingStartOffsetUs,
        summary.passed ? 1 : 0,
        Date.now()
      )

    const nextSnapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      {
        currentTempoBpm: progress.current_tempo_bpm,
        consecutiveCleanRuns: progress.consecutive_clean_runs
      },
      summary.passed,
      config.progression
    )
    sqlite
      .prepare(
        'UPDATE exercise_progress SET current_tempo_bpm = ?, consecutive_clean_runs = ? WHERE exercise_id = ?'
      )
      .run(
        nextSnapshot.currentTempoBpm,
        nextSnapshot.consecutiveCleanRuns,
        exercise.id
      )

    return { runId, nextSnapshot }
  })

  const { runId, nextSnapshot } = transaction()

  return {
    run: {
      id: runId,
      exerciseId: body.exerciseId,
      firstExpectedBeatAtMs: body.firstExpectedBeatAtMs,
      tempoBpm: body.tempoBpm
    },
    originalAssessment: assessment,
    progress: {
      exerciseId: exercise.id,
      initialTempoBpm: progress.initial_tempo_bpm,
      currentTempoBpm: nextSnapshot.currentTempoBpm,
      consecutiveCleanRuns: nextSnapshot.consecutiveCleanRuns
    }
  }
}
