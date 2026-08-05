import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
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

describe('seedCatalog', () => {
  it('inserts the exercise, its steps, and initial progress on a fresh database', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercises').get()
    ).toEqual({ count: 1 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercise_steps').get()
    ).toEqual({ count: 8 })
    expect(
      sqlite
        .prepare(
          'SELECT current_tempo_bpm, consecutive_clean_runs FROM exercise_progress'
        )
        .get()
    ).toEqual({ current_tempo_bpm: 60, consecutive_clean_runs: 0 })

    sqlite.close()
  })

  it('is idempotent: re-running with unchanged data does not throw or duplicate', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)
    expect(() => seedCatalog(sqlite, testConfig)).not.toThrow()

    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercises').get()
    ).toEqual({ count: 1 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercise_steps').get()
    ).toEqual({ count: 8 })

    sqlite.close()
  })

  it('errors instead of silently renaming an already-seeded exercise', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    sqlite
      .prepare(
        "UPDATE exercises SET name = 'Renamed by hand' WHERE slug = 'c-major-ascending'"
      )
      .run()

    expect(() => seedCatalog(sqlite, testConfig)).toThrow(
      /differs from the seed source/
    )
    expect(sqlite.prepare('SELECT name FROM exercises').get()).toEqual({
      name: 'Renamed by hand'
    })

    sqlite.close()
  })

  it('errors instead of silently rewriting an already-seeded step', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    sqlite
      .prepare(
        'UPDATE exercise_steps SET semitone_offset = 6 WHERE step_index = 3'
      )
      .run()

    expect(() => seedCatalog(sqlite, testConfig)).toThrow(
      /step 3 already has.*differs from the seed source/s
    )
    expect(
      sqlite
        .prepare(
          'SELECT semitone_offset FROM exercise_steps WHERE step_index = 3'
        )
        .get()
    ).toEqual({ semitone_offset: 6 })

    sqlite.close()
  })

  it('errors instead of silently changing an already-seeded initial tempo', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    expect(() =>
      seedCatalog(sqlite, { ...testConfig, seedInitialTempoBpm: 80 })
    ).toThrow(/differs from configured SEED_INITIAL_TEMPO_BPM/)
    expect(
      sqlite.prepare('SELECT initial_tempo_bpm FROM exercise_progress').get()
    ).toEqual({ initial_tempo_bpm: 60 })

    sqlite.close()
  })
})
