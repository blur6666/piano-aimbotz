import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const exercises = sqliteTable('exercises', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  direction: text('direction').notNull(),
  tonicPitchClass: integer('tonic_pitch_class').notNull(),
  tempoBpm: integer('tempo_bpm').notNull()
})

export const exerciseSteps = sqliteTable(
  'exercise_steps',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    noteSpelling: text('note_spelling').notNull(),
    semitoneOffset: integer('semitone_offset').notNull(),
    fingerNumber: integer('finger_number').notNull()
  },
  (table) => [
    unique('exercise_step_index').on(table.exerciseId, table.stepIndex)
  ]
)

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  exerciseId: integer('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  performedAtMs: integer('performed_at_ms').notNull(),
  tempoBpm: integer('tempo_bpm').notNull()
})

export const midiEvents = sqliteTable(
  'midi_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    sequenceNumber: integer('sequence_number').notNull(),
    offsetUs: integer('offset_us').notNull(),
    eventType: text('event_type').notNull(),
    midiPitch: integer('midi_pitch').notNull(),
    velocity: integer('velocity').notNull()
  },
  (table) => [
    unique('run_event_sequence').on(table.runId, table.sequenceNumber)
  ]
)
