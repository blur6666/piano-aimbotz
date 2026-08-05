import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  backfillMissingAssessments,
  LEGACY_BACKFILL_ALGORITHM_VERSION
} from '../src/server/db/backfill-assessments.js'
import { buildApp } from '../src/server/app.js'
import type { AppConfig } from '../src/server/config.js'

const schema = `CREATE TABLE exercises (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, direction TEXT NOT NULL, tonic_pitch_class INTEGER NOT NULL);
CREATE TABLE exercise_steps (id INTEGER PRIMARY KEY, exercise_id INTEGER NOT NULL, step_index INTEGER NOT NULL, note_spelling TEXT NOT NULL, semitone_offset INTEGER NOT NULL, finger_number INTEGER NOT NULL, UNIQUE(exercise_id, step_index));
CREATE TABLE exercise_progress (exercise_id INTEGER PRIMARY KEY, initial_tempo_bpm INTEGER NOT NULL, current_tempo_bpm INTEGER NOT NULL, consecutive_clean_runs INTEGER NOT NULL);
CREATE TABLE runs (id INTEGER PRIMARY KEY, exercise_id INTEGER NOT NULL, performed_at_ms INTEGER NOT NULL, tempo_bpm INTEGER NOT NULL);
CREATE TABLE midi_events (id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, sequence_number INTEGER NOT NULL, offset_us INTEGER NOT NULL, event_type TEXT NOT NULL, midi_pitch INTEGER NOT NULL, velocity INTEGER NOT NULL, UNIQUE(run_id, sequence_number));
CREATE TABLE run_assessments (run_id INTEGER PRIMARY KEY, algorithm_version TEXT NOT NULL, scoring_parameters TEXT NOT NULL, progression_policy_version TEXT NOT NULL, progression_parameters TEXT NOT NULL, hard_fault_count INTEGER NOT NULL, timing_fault_count INTEGER NOT NULL, overlap_fault_count INTEGER NOT NULL, timing_sample_count INTEGER NOT NULL, timing_excluded_count INTEGER NOT NULL, mean_absolute_timing_deviation_us INTEGER, passed INTEGER NOT NULL, assessed_at_ms INTEGER NOT NULL);`

const testConfig: AppConfig = {
  scoring: {
    timingToleranceUs: Number.MAX_SAFE_INTEGER,
    overlapToleranceUs: Number.MAX_SAFE_INTEGER,
    maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
    maxOverlapFaultsPerRun: Number.MAX_SAFE_INTEGER,
    recoveryWindowSteps: 1
  },
  progression: {
    cleanRunsRequired: 3,
    tempoIncrementBpm: 4,
    failedRunBehavior: 'reset_streak'
  },
  seedInitialTempoBpm: 60
}

function seedLegacyExercise(sqlite: Database.Database) {
  sqlite
    .prepare(
      "INSERT INTO exercises VALUES (1, 'c-major-ascending', 'C major ascending', 'ascending', 0)"
    )
    .run()
  const steps = [
    ['C', 0, 1],
    ['D', 2, 2],
    ['E', 4, 3],
    ['F', 5, 1],
    ['G', 7, 2],
    ['A', 9, 3],
    ['B', 11, 4],
    ['C', 12, 5]
  ]
  steps.forEach(([note, offset, finger], index) =>
    sqlite
      .prepare('INSERT INTO exercise_steps VALUES (?, 1, ?, ?, ?, ?)')
      .run(index + 1, index, note, offset, finger)
  )
  sqlite.prepare('INSERT INTO exercise_progress VALUES (1, 60, 60, 0)').run()
}

// Simulates a run captured by Stage 1, before run_assessments existed:
// a runs row and its raw midi_events, but no assessment row at all.
function insertLegacyRun(sqlite: Database.Database) {
  sqlite
    .prepare(
      'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, 1, 1000, 60)'
    )
    .run()
  const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
  const insertEvent = sqlite.prepare(
    'INSERT INTO midi_events (run_id, sequence_number, offset_us, event_type, midi_pitch, velocity) VALUES (1, ?, ?, ?, ?, ?)'
  )
  cMajor.forEach((midiPitch, index) =>
    insertEvent.run(index, index * 1_000_000, 'note_on', midiPitch, 100)
  )
}

describe('backfillMissingAssessments', () => {
  it('creates a marked assessment for a run with none and rebuilds progress', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedLegacyExercise(sqlite)
    insertLegacyRun(sqlite)

    const backfilled = backfillMissingAssessments(sqlite, testConfig)
    expect(backfilled).toEqual([1])

    const assessment = sqlite
      .prepare('SELECT * FROM run_assessments WHERE run_id = 1')
      .get() as {
      algorithm_version: string
      hard_fault_count: number
      passed: number
    }
    expect(assessment.algorithm_version).toBe(LEGACY_BACKFILL_ALGORITHM_VERSION)
    expect(assessment.hard_fault_count).toBe(0)
    expect(assessment.passed).toBe(1)

    const progress = sqlite
      .prepare(
        'SELECT consecutive_clean_runs FROM exercise_progress WHERE exercise_id = 1'
      )
      .get() as { consecutive_clean_runs: number }
    expect(progress.consecutive_clean_runs).toBe(1)

    sqlite.close()
  })

  it('is idempotent: a second pass does not duplicate or error', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedLegacyExercise(sqlite)
    insertLegacyRun(sqlite)

    backfillMissingAssessments(sqlite, testConfig)
    const second = backfillMissingAssessments(sqlite, testConfig)
    expect(second).toEqual([])

    const count = sqlite
      .prepare('SELECT count(*) AS count FROM run_assessments')
      .get() as { count: number }
    expect(count.count).toBe(1)

    sqlite.close()
  })

  it('leaves runs that already have an assessment untouched', () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedLegacyExercise(sqlite)
    insertLegacyRun(sqlite)
    sqlite
      .prepare(
        `INSERT INTO run_assessments (run_id, algorithm_version, scoring_parameters, progression_policy_version, progression_parameters, hard_fault_count, timing_fault_count, overlap_fault_count, timing_sample_count, timing_excluded_count, mean_absolute_timing_deviation_us, passed, assessed_at_ms)
         VALUES (1, 'stage2', '{}', 'v1', '{}', 0, 0, 0, 8, 0, 0, 1, 123)`
      )
      .run()

    const backfilled = backfillMissingAssessments(sqlite, testConfig)
    expect(backfilled).toEqual([])

    const assessment = sqlite
      .prepare('SELECT algorithm_version FROM run_assessments WHERE run_id = 1')
      .get() as { algorithm_version: string }
    expect(assessment.algorithm_version).toBe('stage2')

    sqlite.close()
  })

  it('a backfilled legacy run is now visible through the run history and detail APIs', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedLegacyExercise(sqlite)
    insertLegacyRun(sqlite)
    backfillMissingAssessments(sqlite, testConfig)

    const app = buildApp(sqlite, testConfig)
    const history = await app.inject({
      method: 'GET',
      url: '/api/runs?exerciseId=1'
    })
    expect(history.statusCode).toBe(200)
    expect(history.json().runs).toHaveLength(1)

    const detail = await app.inject({ method: 'GET', url: '/api/runs/1' })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().originalAssessment.algorithmVersion).toBe(
      LEGACY_BACKFILL_ALGORITHM_VERSION
    )
    await app.close()
  })
})
