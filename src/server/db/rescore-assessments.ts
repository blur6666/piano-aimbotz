import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { scoreRun } from '../../domain/scoring.js'
import { ALGORITHM_VERSION } from '../runs/create-run.js'
import { rebuildExerciseProgress } from '../progress/rebuild.js'
import { loadConfig, type AppConfig } from '../config.js'
import { openSqlite } from './connection.js'

type RunRow = {
  id: number
  exercise_id: number
  tempo_bpm: number
  notes_per_beat: number
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

// This deliberately replaces stored assessments: the user chose a new timing
// rule, and progression must replay that rule rather than retain stale passes.
export function rescoreAssessments(
  sqlite: Database.Database,
  config: AppConfig
): number[] {
  const runs = sqlite
    .prepare(
      `SELECT r.id, r.exercise_id, r.tempo_bpm, r.notes_per_beat,
              e.direction, s.tonic_pitch_class
       FROM runs r
       JOIN exercises e ON e.id = r.exercise_id
       JOIN scales s ON s.id = e.scale_id
       ORDER BY r.id ASC`
    )
    .all() as RunRow[]
  const updateAssessment = sqlite.prepare(
    `UPDATE run_assessments
     SET algorithm_version = ?, scoring_parameters = ?, hard_fault_count = ?,
         timing_fault_count = ?, overlap_fault_count = ?, timing_sample_count = ?,
         timing_excluded_count = ?, mean_absolute_timing_deviation_us = ?,
         timing_start_offset_us = ?, passed = ?, assessed_at_ms = ?
     WHERE run_id = ?`
  )
  const rescore = sqlite.transaction(() => {
    const exerciseIds = new Set<number>()
    for (const run of runs) {
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
          direction: run.direction as 'ascending' | 'descending',
          tonicPitchClass: run.tonic_pitch_class,
          steps: steps.map((step) => ({
            stepIndex: step.step_index,
            semitoneOffset: step.semitone_offset,
            fingerNumber: step.finger_number
          }))
        },
        tempoBpm: run.tempo_bpm,
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
      const summary = assessment.summary
      updateAssessment.run(
        assessment.algorithmVersion,
        JSON.stringify(assessment.scoringParameters),
        summary.hardFaultCount,
        summary.timingFaultCount,
        summary.overlapFaultCount,
        summary.timingSampleCount,
        summary.timingExcludedCount,
        summary.meanAbsoluteTimingDeviationUs,
        summary.timingStartOffsetUs,
        summary.passed ? 1 : 0,
        Date.now(),
        run.id
      )
      exerciseIds.add(run.exercise_id)
    }
    for (const exerciseId of exerciseIds)
      rebuildExerciseProgress(sqlite, exerciseId)
    return runs.map((run) => run.id)
  })
  return rescore()
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const sqlite = openSqlite()
  const rescored = rescoreAssessments(sqlite, loadConfig())
  console.log(
    `Re-scored assessments for runs: ${rescored.join(', ') || 'none'}`
  )
  sqlite.close()
}
