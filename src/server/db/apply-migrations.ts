import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { MIGRATION_FILES } from './migration-files.js'

// Some migrations (e.g. an ALTER TABLE ... DROP COLUMN) are not safe to
// re-execute once applied, unlike the CREATE TABLE IF NOT EXISTS statements
// earlier migrations relied on. Track what has already run so each file
// applies exactly once.
export function applyMigrations(sqlite: Database.Database): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    )`
  )
  const applied = new Set(
    (
      sqlite.prepare('SELECT filename FROM schema_migrations').all() as {
        filename: string
      }[]
    ).map((row) => row.filename)
  )
  const root = process.cwd()
  for (const filename of MIGRATION_FILES) {
    if (applied.has(filename)) continue
    const sql = fs.readFileSync(path.join(root, 'migrations', filename), 'utf8')
    sqlite.transaction(() => {
      sqlite.exec(sql)
      sqlite
        .prepare(
          'INSERT INTO schema_migrations (filename, applied_at_ms) VALUES (?, ?)'
        )
        .run(filename, Date.now())
    })()
  }
}
