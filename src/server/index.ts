import { buildApp } from './app.js'
import { openSqlite } from './db/connection.js'
import { applyMigrations } from './db/apply-migrations.js'
import { backfillMissingAssessments } from './db/backfill-assessments.js'
import {
  loadConfig,
  assertMinimumTempoAgainstExistingProgress
} from './config.js'

const config = loadConfig()
console.info(
  config.progression.failedRunBehavior === 'step_down'
    ? `Progression: failed runs step down ${config.progression.tempoDecrementBpm} BPM ` +
        `(minimum ${config.progression.minimumTempoBpm} BPM), +${config.progression.tempoIncrementBpm} BPM on advance.`
    : `Progression: failed runs reset the streak (no tempo change), +${config.progression.tempoIncrementBpm} BPM on advance.`
)
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
