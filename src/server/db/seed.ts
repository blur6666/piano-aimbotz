import { openSqlite } from './connection.js'

const sqlite = openSqlite()
const seed = sqlite.transaction(() => {
  const exercise = sqlite
    .prepare(
      `INSERT INTO exercises (slug, name, direction, tonic_pitch_class, tempo_bpm)
       VALUES ('c-major-ascending', 'C major ascending', 'ascending', 0, 60)
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
  const insert = sqlite.prepare(
    `INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id, step_index) DO UPDATE SET
       note_spelling = excluded.note_spelling,
       semitone_offset = excluded.semitone_offset,
       finger_number = excluded.finger_number`
  )
  steps.forEach(([note, offset, finger], index) =>
    insert.run(exercise.id, index, note, offset, finger)
  )
})
seed()
sqlite.close()
