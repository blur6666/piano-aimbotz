import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'

type ExerciseRow = {
  id: number
  slug: string
  name: string
  direction: string
  tonic_pitch_class: number
}

type ProgressRow = {
  current_tempo_bpm: number
  consecutive_clean_runs: number
}

type StepRow = {
  step_index: number
  note_spelling: string
  finger_number: number
}

export function registerExerciseRoutes(
  app: FastifyInstance,
  sqlite: Database.Database
): void {
  app.get('/api/exercises', async (_request, reply) => {
    const exercise = sqlite
      .prepare('SELECT * FROM exercises ORDER BY id')
      .get() as ExerciseRow | undefined
    if (!exercise)
      return reply.code(503).send({
        error: { code: 'not_seeded', message: 'Run npm run seed first.' }
      })
    const progress = sqlite
      .prepare(
        'SELECT current_tempo_bpm, consecutive_clean_runs FROM exercise_progress WHERE exercise_id = ?'
      )
      .get(exercise.id) as ProgressRow | undefined
    if (!progress)
      return reply.code(503).send({
        error: { code: 'not_seeded', message: 'Run npm run seed first.' }
      })
    const steps = sqlite
      .prepare(
        'SELECT step_index, note_spelling, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
      )
      .all(exercise.id) as StepRow[]
    return {
      exercises: [
        {
          id: exercise.id,
          name: exercise.name,
          direction: exercise.direction,
          currentTempoBpm: progress.current_tempo_bpm,
          consecutiveCleanRuns: progress.consecutive_clean_runs,
          steps: steps.map((step) => ({
            stepIndex: step.step_index,
            noteSpelling: step.note_spelling,
            fingerNumber: step.finger_number
          }))
        }
      ]
    }
  })
}
