import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildApp } from '../src/server/app.js'
import type { AppConfig } from '../src/server/config.js'

const schema = `CREATE TABLE exercises (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, direction TEXT NOT NULL, tonic_pitch_class INTEGER NOT NULL);
CREATE TABLE exercise_progress (exercise_id INTEGER PRIMARY KEY, initial_tempo_bpm INTEGER NOT NULL, current_tempo_bpm INTEGER NOT NULL, consecutive_clean_runs INTEGER NOT NULL);`

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

describe('API error envelope', () => {
  let sqlite: Database.Database | undefined
  afterEach(async () => {
    sqlite?.close()
    sqlite = undefined
  })

  it('wraps TypeBox validation failures in the ApiError envelope instead of the Fastify default shape', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(schema)
    const app = buildApp(sqlite, testConfig)

    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId: 'not-a-number',
        firstExpectedBeatAtMs: 1000,
        tempoBpm: 60,
        events: []
      }
    })

    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body).toHaveProperty('error.code', 'invalid_request')
    expect(typeof body.error.message).toBe('string')
    // Fastify's default shape has top-level statusCode/error/message instead
    expect(body).not.toHaveProperty('statusCode')
    await app.close()
  })

  it('wraps an unexpected server error in the ApiError envelope without leaking internals', async () => {
    sqlite = new Database(':memory:')
    // Deliberately missing exercise_steps (and other tables): a run
    // submission will reach past request validation and the exercise/
    // progress lookups, then throw a raw SqliteError querying steps.
    sqlite.exec(schema)
    sqlite
      .prepare(
        "INSERT INTO exercises VALUES (1, 'c-major-ascending', 'C major ascending', 'ascending', 0)"
      )
      .run()
    sqlite.prepare('INSERT INTO exercise_progress VALUES (1, 60, 60, 0)').run()
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

    expect(response.statusCode).toBe(500)
    const body = response.json()
    expect(body).toEqual({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.'
      }
    })
    expect(JSON.stringify(body)).not.toMatch(
      /exercise_steps|SqliteError|no such table/i
    )
    await app.close()
  })
})
