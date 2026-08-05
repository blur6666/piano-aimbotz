import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { openSqlite } from './connection.js'
import { loadConfig, type AppConfig } from '../config.js'

// The seed command inserts missing data and verifies matching existing
// data; it does not silently update definitions (ARCHITECTURE.md).
// Re-running a seed must never reinterpret historical runs, so any
// mismatch between what's already stored and the seed source is a hard
// error rather than an in-place rewrite.
export function seedCatalog(
  sqlite: Database.Database,
  config: AppConfig
): void {
  const seed = sqlite.transaction(() => {
    const existingExercise = sqlite
      .prepare('SELECT id, name FROM exercises WHERE slug = ?')
      .get('c-major-ascending') as { id: number; name: string } | undefined

    const exerciseName = 'C major ascending'
    let exerciseId: number
    if (existingExercise) {
      if (existingExercise.name !== exerciseName)
        throw new Error(
          `Seed error: exercise "c-major-ascending" already has name "${existingExercise.name}", ` +
            `which differs from the seed source "${exerciseName}". Definitions are never silently updated.`
        )
      exerciseId = existingExercise.id
    } else {
      const inserted = sqlite
        .prepare(
          `INSERT INTO exercises (slug, name, direction, tonic_pitch_class)
           VALUES ('c-major-ascending', ?, 'ascending', 0)
           RETURNING id`
        )
        .get(exerciseName) as { id: number }
      exerciseId = inserted.id
    }

    const steps = [
      ['C', 0, 1],
      ['D', 2, 2],
      ['E', 4, 3],
      ['F', 5, 1],
      ['G', 7, 2],
      ['A', 9, 3],
      ['B', 11, 4],
      ['C', 12, 5]
    ] as const
    const selectStep = sqlite.prepare(
      'SELECT note_spelling, semitone_offset, finger_number FROM exercise_steps WHERE exercise_id = ? AND step_index = ?'
    )
    const insertStep = sqlite.prepare(
      `INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number)
       VALUES (?, ?, ?, ?, ?)`
    )
    steps.forEach(([noteSpelling, semitoneOffset, fingerNumber], stepIndex) => {
      const existingStep = selectStep.get(exerciseId, stepIndex) as
        | {
            note_spelling: string
            semitone_offset: number
            finger_number: number
          }
        | undefined
      if (existingStep) {
        if (
          existingStep.note_spelling !== noteSpelling ||
          existingStep.semitone_offset !== semitoneOffset ||
          existingStep.finger_number !== fingerNumber
        )
          throw new Error(
            `Seed error: exercise "c-major-ascending" step ${stepIndex} already has ` +
              `(${existingStep.note_spelling}, ${existingStep.semitone_offset}, ${existingStep.finger_number}), ` +
              `which differs from the seed source (${noteSpelling}, ${semitoneOffset}, ${fingerNumber}). ` +
              'Definitions are never silently updated.'
          )
      } else {
        insertStep.run(
          exerciseId,
          stepIndex,
          noteSpelling,
          semitoneOffset,
          fingerNumber
        )
      }
    })

    const existingProgress = sqlite
      .prepare(
        'SELECT initial_tempo_bpm AS initialTempoBpm FROM exercise_progress WHERE exercise_id = ?'
      )
      .get(exerciseId) as { initialTempoBpm: number } | undefined

    if (existingProgress) {
      if (existingProgress.initialTempoBpm !== config.seedInitialTempoBpm)
        throw new Error(
          `Seed error: exercise "c-major-ascending" already has initial tempo ${existingProgress.initialTempoBpm}, ` +
            `which differs from configured SEED_INITIAL_TEMPO_BPM=${config.seedInitialTempoBpm}. ` +
            'Initial tempo and current progress are never changed by re-seeding.'
        )
    } else {
      sqlite
        .prepare(
          `INSERT INTO exercise_progress (exercise_id, initial_tempo_bpm, current_tempo_bpm, consecutive_clean_runs)
           VALUES (?, ?, ?, 0)`
        )
        .run(exerciseId, config.seedInitialTempoBpm, config.seedInitialTempoBpm)
    }
  })
  seed()
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const config = loadConfig()
  const sqlite = openSqlite()
  seedCatalog(sqlite, config)
  sqlite.close()
}
