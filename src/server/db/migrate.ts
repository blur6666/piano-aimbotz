import { openSqlite } from './connection.js'
import { applyMigrations } from './apply-migrations.js'

const sqlite = openSqlite()
applyMigrations(sqlite)
sqlite.close()
