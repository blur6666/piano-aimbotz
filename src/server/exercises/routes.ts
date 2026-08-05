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
    const exercises = sqlite
      .prepare('SELECT * FROM exercises ORDER BY id')
      .all() as ExerciseRow[]
    if (exercises.length === 0)
      return reply.code(503).send({
        error: { code: 'not_seeded', message: 'Run npm run seed first.' }
      })
    const selectProgress = sqlite.prepare(
      'SELECT current_tempo_bpm, consecutive_clean_runs FROM exercise_progress WHERE exercise_id = ?'
    )
    const selectSteps = sqlite.prepare(
      'SELECT step_index, note_spelling, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
    )
    return {
      exercises: exercises.map((exercise) => {
        const progress = selectProgress.get(exercise.id) as
          ProgressRow | undefined
        // Every seeded exercise gets a progress row in the same
        // transaction (ARCHITECTURE.md); a missing one is a genuine
        // data-integrity bug, not a "not seeded yet" state to hide.
        if (!progress)
          throw new Error(
            `Missing exercise_progress row for exercise ${exercise.id}`
          )
        const steps = selectSteps.all(exercise.id) as StepRow[]
        return {
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
      })
    }
  })
}
