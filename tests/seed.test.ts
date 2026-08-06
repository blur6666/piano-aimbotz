import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
import type { AppConfig } from '../src/server/config.js'

const testConfig: AppConfig = {
  scoring: {
    timingToleranceNoteFraction: 0.05,
    overlapToleranceUs: 30_000,
    maxTimingFaultsPerRun: 0,
    recoveryWindowSteps: 1
  },
  progression: {
    cleanRunsRequired: 3,
    tempoIncrementBpm: 4,
    failedRunBehavior: 'reset_streak'
  },
  seedInitialTempoBpm: 60,
  notesPerBeat: 1
}

function exerciseIdFor(
  sqlite: Database.Database,
  scaleSlug: string,
  direction: 'ascending' | 'descending'
): number {
  return (
    sqlite
      .prepare(
        `SELECT e.id FROM exercises e
         JOIN scales s ON s.id = e.scale_id
         WHERE s.slug = ? AND e.direction = ?`
      )
      .get(scaleSlug, direction) as { id: number }
  ).id
}

describe('seedCatalog', () => {
  it('inserts every group, scale, exercise, step, and initial progress row on a fresh database', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    expect(
      sqlite.prepare('SELECT count(*) AS count FROM progression_groups').get()
    ).toEqual({ count: 3 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM scales').get()
    ).toEqual({ count: 12 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercises').get()
    ).toEqual({ count: 24 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercise_steps').get()
    ).toEqual({ count: 24 * 8 })
    expect(
      sqlite
        .prepare(
          'SELECT count(*) AS count FROM exercise_progress WHERE current_tempo_bpm = 60 AND consecutive_clean_runs = 0'
        )
        .get()
    ).toEqual({ count: 24 })

    sqlite.close()
  })

  it('seeds the descending exercise with reversed fingering and negative offsets', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    const exerciseId = exerciseIdFor(sqlite, 'c-major', 'descending')
    expect(
      sqlite
        .prepare(
          `SELECT e.direction, s.tonic_pitch_class AS tonicPitchClass
           FROM exercises e JOIN scales s ON s.id = e.scale_id WHERE e.id = ?`
        )
        .get(exerciseId)
    ).toEqual({ direction: 'descending', tonicPitchClass: 0 })
    expect(
      sqlite
        .prepare(
          'SELECT note_spelling, semitone_offset, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
        )
        .all(exerciseId)
    ).toEqual([
      { note_spelling: 'C', semitone_offset: 0, finger_number: 5 },
      { note_spelling: 'B', semitone_offset: -1, finger_number: 4 },
      { note_spelling: 'A', semitone_offset: -3, finger_number: 3 },
      { note_spelling: 'G', semitone_offset: -5, finger_number: 2 },
      { note_spelling: 'F', semitone_offset: -7, finger_number: 1 },
      { note_spelling: 'E', semitone_offset: -8, finger_number: 3 },
      { note_spelling: 'D', semitone_offset: -10, finger_number: 2 },
      { note_spelling: 'C', semitone_offset: -12, finger_number: 1 }
    ])

    sqlite.close()
  })

  it('is idempotent: re-running with unchanged data does not throw or duplicate', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)
    expect(() => seedCatalog(sqlite, testConfig)).not.toThrow()

    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercises').get()
    ).toEqual({ count: 24 })
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM exercise_steps').get()
    ).toEqual({ count: 24 * 8 })

    sqlite.close()
  })

  it('errors instead of silently renaming an already-seeded progression group', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    sqlite
      .prepare(
        "UPDATE progression_groups SET name = 'Renamed by hand' WHERE slug = 'group-1'"
      )
      .run()

    expect(() => seedCatalog(sqlite, testConfig)).toThrow(
      /differs from the seed source/
    )
    expect(
      sqlite
        .prepare("SELECT name FROM progression_groups WHERE slug = 'group-1'")
        .get()
    ).toEqual({ name: 'Renamed by hand' })

    sqlite.close()
  })

  it('errors instead of silently renaming an already-seeded scale', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    sqlite
      .prepare(
        "UPDATE scales SET display_name = 'Renamed by hand' WHERE slug = 'c-major'"
      )
      .run()

    expect(() => seedCatalog(sqlite, testConfig)).toThrow(
      /differs from the seed source/
    )
    expect(
      sqlite
        .prepare("SELECT display_name FROM scales WHERE slug = 'c-major'")
        .get()
    ).toEqual({ display_name: 'Renamed by hand' })

    sqlite.close()
  })

  it('errors instead of silently rewriting an already-seeded step', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    const exerciseId = exerciseIdFor(sqlite, 'c-major', 'ascending')
    sqlite
      .prepare(
        'UPDATE exercise_steps SET semitone_offset = 6 WHERE exercise_id = ? AND step_index = 3'
      )
      .run(exerciseId)

    expect(() => seedCatalog(sqlite, testConfig)).toThrow(
      /step 3 already has.*differs from the seed source/s
    )
    expect(
      sqlite
        .prepare(
          'SELECT semitone_offset FROM exercise_steps WHERE exercise_id = ? AND step_index = 3'
        )
        .get(exerciseId)
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
      sqlite
        .prepare(
          'SELECT count(*) AS count FROM exercise_progress WHERE initial_tempo_bpm = 60'
        )
        .get()
    ).toEqual({ count: 24 })

    sqlite.close()
  })
})
