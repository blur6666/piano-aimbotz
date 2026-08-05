import { openSqlite } from './connection.js'
import { loadConfig } from '../config.js'

const config = loadConfig()
const sqlite = openSqlite()
const seed = sqlite.transaction(() => {
  const exercise = sqlite
    .prepare(
      `INSERT INTO exercises (slug, name, direction, tonic_pitch_class)
       VALUES ('c-major-ascending', 'C major ascending', 'ascending', 0)
       ON CONFLICT(slug) DO UPDATE SET name = excluded.name
       RETURNING id`
    )
    .get() as { id: number }

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
  const insertStep = sqlite.prepare(
    `INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id, step_index) DO UPDATE SET
       note_spelling = excluded.note_spelling,
       semitone_offset = excluded.semitone_offset,
       finger_number = excluded.finger_number`
  )
  steps.forEach(([note, offset, finger], index) =>
    insertStep.run(exercise.id, index, note, offset, finger)
  )

  const existingProgress = sqlite
    .prepare(
      'SELECT initial_tempo_bpm AS initialTempoBpm FROM exercise_progress WHERE exercise_id = ?'
    )
    .get(exercise.id) as { initialTempoBpm: number } | undefined

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
      .run(exercise.id, config.seedInitialTempoBpm, config.seedInitialTempoBpm)
  }
})
seed()
sqlite.close()
