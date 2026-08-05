import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import type {
  Exercise,
  ExerciseListResponse,
  ProgressionGroup,
  Scale
} from '../../shared/contracts.js'

type ExerciseRow = {
  exercise_id: number
  direction: 'ascending' | 'descending'
  current_tempo_bpm: number
  consecutive_clean_runs: number
  group_slug: string
  group_name: string
  group_progression_order: number
  scale_slug: string
  scale_display_name: string
  scale_position_in_group: number
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
    const exerciseCount = sqlite
      .prepare('SELECT count(*) AS count FROM exercises')
      .get() as { count: number }
    if (exerciseCount.count === 0)
      return reply.code(503).send({
        error: { code: 'not_seeded', message: 'Run npm run seed first.' }
      })

    // Every seeded exercise gets a progress row in the same transaction
    // (ARCHITECTURE.md); a missing one is a genuine data-integrity bug,
    // not a "not seeded yet" state to hide.
    const missingProgress = sqlite
      .prepare(
        `SELECT e.id FROM exercises e
         LEFT JOIN exercise_progress p ON p.exercise_id = e.id
         WHERE p.exercise_id IS NULL`
      )
      .all() as { id: number }[]
    if (missingProgress.length > 0)
      throw new Error(
        `Missing exercise_progress row for exercise ${missingProgress[0].id}`
      )

    const rows = sqlite
      .prepare(
        `SELECT
           e.id AS exercise_id,
           e.direction AS direction,
           p.current_tempo_bpm AS current_tempo_bpm,
           p.consecutive_clean_runs AS consecutive_clean_runs,
           g.slug AS group_slug,
           g.name AS group_name,
           g.progression_order AS group_progression_order,
           s.slug AS scale_slug,
           s.display_name AS scale_display_name,
           s.position_in_group AS scale_position_in_group
         FROM exercises e
         JOIN scales s ON s.id = e.scale_id
         JOIN progression_groups g ON g.id = s.progression_group_id
         JOIN exercise_progress p ON p.exercise_id = e.id
         ORDER BY g.progression_order, s.position_in_group, e.id`
      )
      .all() as ExerciseRow[]

    const selectSteps = sqlite.prepare(
      'SELECT step_index, note_spelling, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
    )

    const groupsBySlug = new Map<string, ProgressionGroup>()
    const scalesBySlug = new Map<string, Scale>()

    for (const row of rows) {
      const steps = selectSteps.all(row.exercise_id) as StepRow[]
      const exercise: Exercise = {
        id: row.exercise_id,
        direction: row.direction,
        currentTempoBpm: row.current_tempo_bpm,
        consecutiveCleanRuns: row.consecutive_clean_runs,
        steps: steps.map((step) => ({
          stepIndex: step.step_index,
          noteSpelling: step.note_spelling,
          fingerNumber: step.finger_number
        }))
      }

      let scale = scalesBySlug.get(row.scale_slug)
      if (!scale) {
        scale = {
          slug: row.scale_slug,
          displayName: row.scale_display_name,
          positionInGroup: row.scale_position_in_group,
          exercises: []
        }
        scalesBySlug.set(row.scale_slug, scale)

        let group = groupsBySlug.get(row.group_slug)
        if (!group) {
          group = {
            slug: row.group_slug,
            name: row.group_name,
            progressionOrder: row.group_progression_order,
            scales: []
          }
          groupsBySlug.set(row.group_slug, group)
        }
        group.scales.push(scale)
      }
      scale.exercises.push(exercise)
    }

    const response: ExerciseListResponse = {
      groups: [...groupsBySlug.values()]
    }
    return response
  })
}
