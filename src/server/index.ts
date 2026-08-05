import { buildApp } from './app.js'
import { openSqlite } from './db/connection.js'
import { applyMigrations } from './db/apply-migrations.js'
import { backfillMissingAssessments } from './db/backfill-assessments.js'
import {
  loadConfig,
  assertMinimumTempoAgainstExistingProgress
} from './config.js'

const config = loadConfig()
const sqlite = openSqlite()
applyMigrations(sqlite)
backfillMissingAssessments(sqlite, config)

const lowestCurrentTempo = sqlite
  .prepare('SELECT MIN(current_tempo_bpm) AS lowest FROM exercise_progress')
  .get() as { lowest: number | null }
assertMinimumTempoAgainstExistingProgress(
  config.progression,
  lowestCurrentTempo.lowest
)

const app = buildApp(sqlite, config)
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
await app.listen({ host, port })
console.log(`Piano Scale Trainer listening on http://localhost:${port}`)
