import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'node:path'

export function databasePath(): string {
  return process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'piano.db')
}

export function openSqlite(): Database.Database {
  const sqlite = new Database(databasePath())
  sqlite.pragma('foreign_keys = ON')
  return sqlite
}

export function openDatabase() {
  const sqlite = openSqlite()
  return { sqlite, db: drizzle(sqlite) }
}
