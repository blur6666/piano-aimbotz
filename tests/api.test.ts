import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
import { buildApp } from '../src/server/app.js'
import type { AppConfig } from '../src/server/config.js'

const testConfig: AppConfig = {
  scoring: {
    timingToleranceNoteFraction: 1_000,
    overlapToleranceUs: Number.MAX_SAFE_INTEGER,
    maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
    recoveryWindowSteps: 1
  },
  progression: {
    cleanRunsRequired: 3,
    tempoIncrementBpm: 4,
    failedRunBehavior: 'reset_streak'
  },
  recommendation: {
    clearOctaves: 1,
    clearDirections: ['ascending', 'descending']
  },
  seedInitialTempoBpm: 60,
  notesPerBeat: 1
}

function seedAndOpenCMajorAscending(
  sqlite: Database.Database,
  currentTempoBpm = 60
): number {
  applyMigrations(sqlite)
  seedCatalog(sqlite, testConfig)
  const exerciseId = (
    sqlite
      .prepare(
        `SELECT e.id FROM exercises e
         JOIN scales s ON s.id = e.scale_id
         WHERE s.slug = 'c-major' AND e.direction = 'ascending'`
      )
      .get() as { id: number }
  ).id
  if (currentTempoBpm !== testConfig.seedInitialTempoBpm)
    sqlite
      .prepare(
        'UPDATE exercise_progress SET current_tempo_bpm = ? WHERE exercise_id = ?'
      )
      .run(currentTempoBpm, exerciseId)
  return exerciseId
}

describe('run API', () => {
  let sqlite: Database.Database | undefined
  afterEach(async () => {
    sqlite?.close()
    sqlite = undefined
  })

  it('stores a completed run and raw events atomically', async () => {
    sqlite = new Database(':memory:')
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId,
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
      sqlite
        .prepare(
          'SELECT count(*) as count FROM run_assessments WHERE run_id IN (SELECT id FROM runs WHERE exercise_id = ?)'
        )
        .get(exerciseId)
    ).toEqual({ count: 1 })
    await app.close()
  })

  it('rejects a run submitted against a stale tempo', async () => {
    sqlite = new Database(':memory:')
    const exerciseId = seedAndOpenCMajorAscending(sqlite, 64)
    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId,
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
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    const app = buildApp(sqlite, testConfig)
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
    const playCleanRun = () =>
      app.inject({
        method: 'POST',
        url: '/api/runs',
        payload: {
          exerciseId,
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
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    const app = buildApp(sqlite, testConfig)
    await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId,
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
      url: `/api/runs?exerciseId=${exerciseId}`
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
