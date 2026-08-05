import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
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

function seedExercise(sqlite: Database.Database, tempoBpm: number) {
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
  sqlite
    .prepare('INSERT INTO exercise_progress VALUES (1, ?, ?, 0)')
    .run(tempoBpm, tempoBpm)
}

describe('run API', () => {
  let sqlite: Database.Database | undefined
  afterEach(async () => {
    sqlite?.close()
    sqlite = undefined
  })

  it('stores a completed run and raw events atomically', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedExercise(sqlite, 60)
    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId: 1,
        firstExpectedBeatAtMs: 1000,
        tempoBpm: 60,
        events: [
          {
            sequenceNumber: 0,
            offsetUs: 0,
            type: 'note_on',
            midiPitch: 60,
            velocity: 100
          },
          {
            sequenceNumber: 1,
            offsetUs: 100,
            type: 'note_on',
            midiPitch: 61,
            velocity: 100
          }
        ]
      }
    })
    expect(response.statusCode).toBe(201)
    // 1 extra (wrong note) + 6 missed (unplayed trailing steps after step 1)
    expect(response.json().originalAssessment.summary.hardFaultCount).toBe(8)
    expect(
      sqlite.prepare('SELECT count(*) as count FROM midi_events').get()
    ).toEqual({ count: 2 })
    expect(
      sqlite.prepare('SELECT count(*) as count FROM run_assessments').get()
    ).toEqual({ count: 1 })
    await app.close()
  })

  it('rejects a run submitted against a stale tempo', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedExercise(sqlite, 64)
    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId: 1,
        firstExpectedBeatAtMs: 1000,
        tempoBpm: 60,
        events: []
      }
    })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('stale_tempo')
    expect(response.json().error.currentTempoBpm).toBe(64)
    await app.close()
  })

  it('advances tempo and resets the streak after three clean runs', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedExercise(sqlite, 60)
    const app = buildApp(sqlite, testConfig)
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
    const playCleanRun = () =>
      app.inject({
        method: 'POST',
        url: '/api/runs',
        payload: {
          exerciseId: 1,
          firstExpectedBeatAtMs: 1000,
          tempoBpm: 60,
          events: cMajor.map((midiPitch, index) => ({
            sequenceNumber: index,
            offsetUs: index * 1_000_000,
            type: 'note_on' as const,
            midiPitch,
            velocity: 100
          }))
        }
      })

    const first = await playCleanRun()
    expect(first.json().progress.consecutiveCleanRuns).toBe(1)
    const second = await playCleanRun()
    expect(second.json().progress.consecutiveCleanRuns).toBe(2)
    const third = await playCleanRun()
    expect(third.json().progress.consecutiveCleanRuns).toBe(0)
    expect(third.json().progress.currentTempoBpm).toBe(64)
    await app.close()
  })

  it('returns run history and current-assessment detail', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(schema)
    seedExercise(sqlite, 60)
    const app = buildApp(sqlite, testConfig)
    await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId: 1,
        firstExpectedBeatAtMs: 1000,
        tempoBpm: 60,
        events: [
          {
            sequenceNumber: 0,
            offsetUs: 0,
            type: 'note_on',
            midiPitch: 60,
            velocity: 100
          }
        ]
      }
    })

    const history = await app.inject({
      method: 'GET',
      url: '/api/runs?exerciseId=1'
    })
    expect(history.statusCode).toBe(200)
    expect(history.json().runs).toHaveLength(1)

    const runId = history.json().runs[0].id
    const detail = await app.inject({
      method: 'GET',
      url: `/api/runs/${runId}`
    })
    expect(detail.statusCode).toBe(200)
    // only step 0 was played; steps 1-7 are unplayed trailing missed faults
    expect(detail.json().currentAssessment.summary.hardFaultCount).toBe(7)
    expect(detail.json().originalAssessment.progressionPolicyVersion).toBe('v1')
    await app.close()
  })
})
