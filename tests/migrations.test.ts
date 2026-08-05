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
})
