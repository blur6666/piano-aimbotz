import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { MIGRATION_FILES } from '../src/server/db/migration-files.js'
import { applyMigrations } from '../src/server/db/apply-migrations.js'

function readMigration(filename: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'migrations', filename), 'utf8')
}

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
        'progression_groups',
        'scales',
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

  it('migration 0006 seeds the group-1/c-major scale that pre-existing exercises rely on', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    expect(sqlite.prepare('SELECT slug, name, progression_order FROM progression_groups').all()).toEqual([
      { slug: 'group-1', name: 'Group 1 — shared fingering', progression_order: 1 }
    ])
    expect(
      sqlite
        .prepare('SELECT slug, display_name, tonic_pitch_class, position_in_group FROM scales')
        .all()
    ).toEqual([
      { slug: 'c-major', display_name: 'C major', tonic_pitch_class: 0, position_in_group: 1 }
    ])
    sqlite.close()
  })

  it('migration 0006 rebuilds exercises onto scale_id, preserving ids and fixture data across the table rebuild', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')

    const priorFiles = MIGRATION_FILES.slice(
      0,
      MIGRATION_FILES.indexOf('0006_progression_catalog.sql')
    )
    for (const filename of priorFiles) sqlite.exec(readMigration(filename))

    sqlite
      .prepare(
        "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (1, 'c-major-ascending', 'C major ascending', 'ascending', 0)"
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (2, 'c-major-descending', 'C major descending', 'descending', 0)"
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

    sqlite.pragma('foreign_keys = OFF')
    sqlite.exec(readMigration('0006_progression_catalog.sql'))
    sqlite.pragma('foreign_keys = ON')

    const scale = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }
    expect(
      sqlite.prepare('SELECT id, scale_id, direction FROM exercises ORDER BY id').all()
    ).toEqual([
      { id: 1, scale_id: scale.id, direction: 'ascending' },
      { id: 2, scale_id: scale.id, direction: 'descending' }
    ])
    expect(
      sqlite.prepare('SELECT exercise_id, step_index FROM exercise_steps').all()
    ).toEqual([{ exercise_id: 1, step_index: 0 }])
    expect(sqlite.prepare('SELECT id FROM runs').all()).toEqual([{ id: 1 }])
    expect(sqlite.pragma('foreign_key_check')).toEqual([])

    sqlite.close()
  })

  it('scales enforces unique tonic_pitch_class and unique position within a group', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    // group-1/c-major (tonic 0, position 1) already exists from migration 0006.
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group) VALUES (1, 'g-major', 'G major', 0, 2)"
        )
        .run()
    ).toThrow(/UNIQUE constraint failed/)
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group) VALUES (1, 'g-major', 'G major', 7, 1)"
        )
        .run()
    ).toThrow(/UNIQUE constraint failed/)
    sqlite.close()
  })

  it('exercises.direction accepts descending and still rejects invalid directions', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    const scale = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }

    expect(() =>
      sqlite
        .prepare('INSERT INTO exercises (id, scale_id, direction) VALUES (1, ?, ?)')
        .run(scale.id, 'descending')
    ).not.toThrow()

    expect(() =>
      sqlite
        .prepare('INSERT INTO exercises (id, scale_id, direction) VALUES (2, ?, ?)')
        .run(scale.id, 'sideways')
    ).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })

  it('exercise_steps.semitone_offset allows negative values for descending steps and still rejects out-of-range values', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    const scale = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }
    sqlite
      .prepare('INSERT INTO exercises (id, scale_id, direction) VALUES (1, ?, ?)')
      .run(scale.id, 'descending')

    // C major descending, anchored on the upper C: C B A G F E D C
    const descendingOffsets = [0, -1, -3, -5, -7, -8, -10, -12]
    const insertStep = sqlite.prepare(
      'INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, ?, ?, ?, 1)'
    )
    expect(() =>
      descendingOffsets.forEach((offset, index) =>
        insertStep.run(index, 'X', offset)
      )
    ).not.toThrow()
    expect(
      sqlite
        .prepare(
          'SELECT semitone_offset FROM exercise_steps WHERE exercise_id = 1 ORDER BY step_index'
        )
        .all()
    ).toEqual(descendingOffsets.map((semitone_offset) => ({ semitone_offset })))

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 8, 'Y', -13, 1)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 8, 'Y', 13, 1)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })
})
