import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { openSqlite } from './connection.js'
import { loadConfig, type AppConfig } from '../config.js'
import { catalogV1 } from '../../../catalog/v1.js'
import {
  validateCatalog,
  type CatalogExercise,
  type CatalogGroup,
  type CatalogScale
} from '../../domain/catalog/index.js'

// The seed command inserts missing data and verifies matching existing
// data; it does not silently update definitions (ARCHITECTURE.md).
// Re-running a seed must never reinterpret historical runs, so any
// mismatch between what's already stored and the seed source is a hard
// error rather than an in-place rewrite.
export function seedCatalog(
  sqlite: Database.Database,
  config: AppConfig
): void {
  validateCatalog(catalogV1)
  const seed = sqlite.transaction(() => {
    for (const group of catalogV1.groups) {
      const groupId = seedProgressionGroup(sqlite, group)
      for (const scale of group.scales) {
        const scaleId = seedScale(sqlite, scale, groupId)
        for (const exercise of scale.exercises) {
          const exerciseId = seedExercise(sqlite, scale, exercise, scaleId)
          seedExerciseSteps(sqlite, scale, exercise, exerciseId)
          seedExerciseProgress(sqlite, scale, exercise, exerciseId, config)
        }
      }
    }
  })
  seed()
}

function seedProgressionGroup(
  sqlite: Database.Database,
  group: CatalogGroup
): number {
  const existing = sqlite
    .prepare(
      'SELECT id, name, progression_order AS progressionOrder FROM progression_groups WHERE slug = ?'
    )
    .get(group.slug) as
    | { id: number; name: string; progressionOrder: number }
    | undefined

  if (existing) {
    if (
      existing.name !== group.name ||
      existing.progressionOrder !== group.progressionOrder
    )
      throw new Error(
        `Seed error: progression group "${group.slug}" already has (name="${existing.name}", progressionOrder=${existing.progressionOrder}), ` +
          `which differs from the seed source (name="${group.name}", progressionOrder=${group.progressionOrder}). Definitions are never silently updated.`
      )
    return existing.id
  }

  const inserted = sqlite
    .prepare(
      `INSERT INTO progression_groups (slug, name, progression_order)
       VALUES (?, ?, ?)
       RETURNING id`
    )
    .get(group.slug, group.name, group.progressionOrder) as { id: number }
  return inserted.id
}

function seedScale(
  sqlite: Database.Database,
  scale: CatalogScale,
  groupId: number
): number {
  const existing = sqlite
    .prepare(
      `SELECT id, progression_group_id AS progressionGroupId, display_name AS displayName,
              tonic_pitch_class AS tonicPitchClass, position_in_group AS positionInGroup
       FROM scales WHERE slug = ?`
    )
    .get(scale.slug) as
    | {
        id: number
        progressionGroupId: number
        displayName: string
        tonicPitchClass: number
        positionInGroup: number
      }
    | undefined

  if (existing) {
    if (
      existing.progressionGroupId !== groupId ||
      existing.displayName !== scale.displayName ||
      existing.tonicPitchClass !== scale.tonicPitchClass ||
      existing.positionInGroup !== scale.positionInGroup
    )
      throw new Error(
        `Seed error: scale "${scale.slug}" already has (progressionGroupId=${existing.progressionGroupId}, displayName="${existing.displayName}", ` +
          `tonicPitchClass=${existing.tonicPitchClass}, positionInGroup=${existing.positionInGroup}), which differs from the seed source ` +
          `(progressionGroupId=${groupId}, displayName="${scale.displayName}", tonicPitchClass=${scale.tonicPitchClass}, positionInGroup=${scale.positionInGroup}). ` +
          'Definitions are never silently updated.'
      )
    return existing.id
  }

  const inserted = sqlite
    .prepare(
      `INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id`
    )
    .get(
      groupId,
      scale.slug,
      scale.displayName,
      scale.tonicPitchClass,
      scale.positionInGroup
    ) as { id: number }
  return inserted.id
}

function seedExercise(
  sqlite: Database.Database,
  _scale: CatalogScale,
  exercise: CatalogExercise,
  scaleId: number
): number {
  const existing = sqlite
    .prepare('SELECT id FROM exercises WHERE scale_id = ? AND direction = ?')
    .get(scaleId, exercise.direction) as { id: number } | undefined
  if (existing) return existing.id

  const inserted = sqlite
    .prepare(
      `INSERT INTO exercises (scale_id, direction)
       VALUES (?, ?)
       RETURNING id`
    )
    .get(scaleId, exercise.direction) as { id: number }
  return inserted.id
}

function seedExerciseSteps(
  sqlite: Database.Database,
  scale: CatalogScale,
  exercise: CatalogExercise,
  exerciseId: number
): void {
  const label = `${scale.slug} ${exercise.direction}`
  const selectStep = sqlite.prepare(
    'SELECT note_spelling, semitone_offset, finger_number FROM exercise_steps WHERE exercise_id = ? AND step_index = ?'
  )
  const insertStep = sqlite.prepare(
    `INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number)
     VALUES (?, ?, ?, ?, ?)`
  )
  exercise.steps.forEach(
    ([noteSpelling, semitoneOffset, fingerNumber], stepIndex) => {
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
            `Seed error: exercise "${label}" step ${stepIndex} already has ` +
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
    }
  )
}

function seedExerciseProgress(
  sqlite: Database.Database,
  scale: CatalogScale,
  exercise: CatalogExercise,
  exerciseId: number,
  config: AppConfig
): void {
  const label = `${scale.slug} ${exercise.direction}`
  const existingProgress = sqlite
    .prepare(
      'SELECT initial_tempo_bpm AS initialTempoBpm FROM exercise_progress WHERE exercise_id = ?'
    )
    .get(exerciseId) as { initialTempoBpm: number } | undefined

  if (existingProgress) {
    if (existingProgress.initialTempoBpm !== config.seedInitialTempoBpm)
      throw new Error(
        `Seed error: exercise "${label}" already has initial tempo ${existingProgress.initialTempoBpm}, ` +
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
