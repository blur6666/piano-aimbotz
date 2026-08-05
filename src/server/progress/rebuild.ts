import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { openSqlite } from '../db/connection.js'
import {
  replayProgression,
  type ProgressionPolicy
} from '../../domain/progression/index.js'

type ProgressRow = {
  exercise_id: number
  initial_tempo_bpm: number
}

type AssessmentRow = {
  passed: number
  progression_policy_version: string
  progression_parameters: string
}

export function rebuildExerciseProgress(
  sqlite: Database.Database,
  exerciseId: number
): void {
  const progress = sqlite
    .prepare(
      'SELECT exercise_id, initial_tempo_bpm FROM exercise_progress WHERE exercise_id = ?'
    )
    .get(exerciseId) as ProgressRow | undefined
  if (!progress)
    throw new Error(`No exercise_progress row for exercise ${exerciseId}`)

  const assessments = sqlite
    .prepare(
      `SELECT a.passed, a.progression_policy_version, a.progression_parameters
       FROM runs r
       JOIN run_assessments a ON a.run_id = r.id
       WHERE r.exercise_id = ?
       ORDER BY r.id ASC`
    )
    .all(exerciseId) as AssessmentRow[]

  const snapshot = replayProgression(
    progress.initial_tempo_bpm,
    assessments.map((assessment) => ({
      passed: assessment.passed === 1,
      progressionPolicyVersion: assessment.progression_policy_version,
      progressionParameters: JSON.parse(
        assessment.progression_parameters
      ) as ProgressionPolicy
    }))
  )

  sqlite
    .prepare(
      'UPDATE exercise_progress SET current_tempo_bpm = ?, consecutive_clean_runs = ? WHERE exercise_id = ?'
    )
    .run(snapshot.currentTempoBpm, snapshot.consecutiveCleanRuns, exerciseId)
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMainModule) {
  const sqlite = openSqlite()
  const requestedId = process.argv[2] ? Number(process.argv[2]) : undefined
  const exerciseIds =
    requestedId !== undefined
      ? [requestedId]
      : (
          sqlite.prepare('SELECT exercise_id FROM exercise_progress').all() as {
            exercise_id: number
          }[]
        ).map((row) => row.exercise_id)
  for (const exerciseId of exerciseIds)
    rebuildExerciseProgress(sqlite, exerciseId)
  sqlite.close()
}
