import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
import { buildApp } from '../src/server/app.js'
import type { AppConfig } from '../src/server/config.js'

const testConfig: AppConfig = {
  scoring: {
    timingToleranceUs: 50_000,
    overlapToleranceUs: 0,
    maxTimingFaultsPerRun: 0,
    maxOverlapFaultsPerRun: 0,
    recoveryWindowSteps: 1
  },
  progression: {
    cleanRunsRequired: 3,
    tempoIncrementBpm: 4,
    failedRunBehavior: 'reset_streak'
  },
  seedInitialTempoBpm: 60
}

describe('GET /api/exercises', () => {
  it('returns every seeded exercise, not just the first', async () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    // A second exercise, inserted directly (the catalog seed only creates
    // c-major-ascending for now) to prove the route doesn't silently drop
    // it.
    const second = sqlite
      .prepare(
        `INSERT INTO exercises (slug, name, direction, tonic_pitch_class)
         VALUES ('c-major-descending', 'C major descending', 'descending', 0)
         RETURNING id`
      )
      .get() as { id: number }
    sqlite
      .prepare(
        'INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (?, 0, ?, ?, 1)'
      )
      .run(second.id, 'C', 0)
    sqlite
      .prepare(
        'INSERT INTO exercise_progress (exercise_id, initial_tempo_bpm, current_tempo_bpm, consecutive_clean_runs) VALUES (?, 60, 60, 0)'
      )
      .run(second.id)

    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({ method: 'GET', url: '/api/exercises' })
    expect(response.statusCode).toBe(200)
    const names = response
      .json()
      .exercises.map((exercise: { name: string }) => exercise.name)
    expect(names).toEqual(['C major ascending', 'C major descending'])

    await app.close()
    sqlite.close()
  })
})
