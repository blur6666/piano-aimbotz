import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { MIGRATION_FILES } from '../src/server/db/migration-files.js'
import { applyMigrations } from '../src/server/db/apply-migrations.js'

describe('applyMigrations', () => {
  it('applies every migration file to an empty database', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'exercises',
        'exercise_steps',
        'runs',
        'midi_events',
        'run_assessments',
        'exercise_progress'
      ])
    )
    sqlite.close()
  })

  it('is idempotent: re-applying after a non-idempotent ALTER migration does not error', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    expect(() => applyMigrations(sqlite)).not.toThrow()
    const applied = sqlite
      .prepare('SELECT filename FROM schema_migrations')
      .all() as { filename: string }[]
    expect(applied.map((row) => row.filename).sort()).toEqual(
      [...MIGRATION_FILES].sort()
    )
    sqlite.close()
  })

  it('every listed migration file exists on disk', () => {
    for (const filename of MIGRATION_FILES)
      expect(
        fs.existsSync(path.join(process.cwd(), 'migrations', filename))
      ).toBe(true)
  })

  it('an altering migration (0004, a table rebuild) preserves existing fixture data', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    applyMigrations(sqlite)

    sqlite
      .prepare(
        "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (1, 'c-major-ascending', 'C major ascending', 'ascending', 0)"
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 0, 'C', 0, 1)"
      )
      .run()
    sqlite.prepare('INSERT INTO exercise_progress VALUES (1, 60, 60, 0)').run()
    sqlite
      .prepare(
        'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, 1, 1000, 60)'
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO midi_events (run_id, sequence_number, offset_us, event_type, midi_pitch, velocity) VALUES (1, 0, 0, 'note_on', 60, 100)"
      )
      .run()

    expect(sqlite.prepare('SELECT * FROM exercises').all()).toEqual([
      {
        id: 1,
        slug: 'c-major-ascending',
        name: 'C major ascending',
        direction: 'ascending',
        tonic_pitch_class: 0
      }
    ])
    expect(sqlite.pragma('foreign_key_check')).toEqual([])

    sqlite.close()
  })

  it('migration 0004 accepts descending and still rejects invalid directions', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (1, 'c-major-descending', 'C major descending', 'descending', 0)"
        )
        .run()
    ).not.toThrow()

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (2, 'bogus', 'Bogus', 'sideways', 0)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })
})
