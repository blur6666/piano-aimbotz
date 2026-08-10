import type { ScoringConfig } from '../domain/scoring.js'
import type { ProgressionPolicy } from '../domain/progression/index.js'

export type AppConfig = {
  scoring: ScoringConfig
  progression: ProgressionPolicy
  seedInitialTempoBpm: number
  // Applied to every new run and stored on the run row. Not a per-exercise
  // column: every exercise currently uses the same grid, and docs/SPEC.md says
  // to pick the simple thing where a simple and a general one both work.
  // Promote it to a column when an exercise genuinely needs a different
  // grid from its neighbours.
  notesPerBeat: number
}

class ConfigError extends Error {}

function requireInt(
  env: NodeJS.ProcessEnv,
  name: string,
  { min }: { min: number }
): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '')
    throw new ConfigError(`Missing required configuration value: ${name}`)
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min)
    throw new ConfigError(
      `Invalid configuration value for ${name}: expected an integer >= ${min}, got ${raw}`
    )
  return value
}

function requireFraction(
  env: NodeJS.ProcessEnv,
  name: string,
  { max }: { max: number }
): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '')
    throw new ConfigError(`Missing required configuration value: ${name}`)
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > max)
    throw new ConfigError(
      `Invalid configuration value for ${name}: expected a number between 0 and ${max}, got ${raw}`
    )
  return value
}

function requireEnum<T extends string>(
  env: NodeJS.ProcessEnv,
  name: string,
  allowed: readonly T[]
): T {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '')
    throw new ConfigError(`Missing required configuration value: ${name}`)
  if (!allowed.includes(raw as T))
    throw new ConfigError(
      `Invalid configuration value for ${name}: expected one of ${allowed.join(', ')}, got ${raw}`
    )
  return raw as T
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const scoring: ScoringConfig = {
    // Capped at 0.5: half a note interval of tolerance means a note landing
    // nearer its neighbour than its own slot would still pass, which makes
    // the measurement meaningless rather than merely lenient.
    timingToleranceNoteFraction: requireFraction(
      env,
      'SCORING_TIMING_TOLERANCE_NOTE_FRACTION',
      { max: 0.5 }
    ),
    overlapToleranceUs: requireInt(env, 'SCORING_OVERLAP_TOLERANCE_US', {
      min: 0
    }),
    maxTimingFaultsPerRun: requireInt(
      env,
      'SCORING_MAX_TIMING_FAULTS_PER_RUN',
      { min: 0 }
    ),
    recoveryWindowSteps: requireInt(env, 'SCORING_RECOVERY_WINDOW_STEPS', {
      min: 0
    })
  }

  const seedInitialTempoBpm = requireInt(env, 'SEED_INITIAL_TEMPO_BPM', {
    min: 1
  })
  const notesPerBeat = requireInt(env, 'EXERCISE_NOTES_PER_BEAT', { min: 1 })
  // Mirrors the CHECK constraint in migrations/0007: a value the database
  // would reject should fail at startup, not on the first run submission.
  if (notesPerBeat !== 1 && notesPerBeat !== 2)
    throw new ConfigError(
      `Invalid configuration value for EXERCISE_NOTES_PER_BEAT: expected 1 (quarters) or 2 (eighths), got ${notesPerBeat}`
    )
  const tempoIncrementBpm = requireInt(env, 'PROGRESSION_TEMPO_INCREMENT_BPM', {
    min: 1
  })
  const failedRunBehavior = requireEnum(
    env,
    'PROGRESSION_FAILED_RUN_BEHAVIOR',
    ['reset_streak', 'step_down'] as const
  )

  const progression: ProgressionPolicy =
    failedRunBehavior === 'reset_streak'
      ? { cleanRunsRequired: 3, tempoIncrementBpm, failedRunBehavior }
      : (() => {
          const tempoDecrementBpm = requireInt(
            env,
            'PROGRESSION_TEMPO_DECREMENT_BPM',
            { min: 1 }
          )
          const minimumTempoBpm = requireInt(
            env,
            'PROGRESSION_MINIMUM_TEMPO_BPM',
            { min: 1 }
          )
          if (minimumTempoBpm > seedInitialTempoBpm)
            throw new ConfigError(
              `PROGRESSION_MINIMUM_TEMPO_BPM (${minimumTempoBpm}) must not exceed SEED_INITIAL_TEMPO_BPM (${seedInitialTempoBpm})`
            )
          return {
            cleanRunsRequired: 3,
            tempoIncrementBpm,
            failedRunBehavior,
            tempoDecrementBpm,
            minimumTempoBpm
          }
        })()

  return { scoring, progression, seedInitialTempoBpm, notesPerBeat }
}

export function assertMinimumTempoAgainstExistingProgress(
  policy: ProgressionPolicy,
  lowestCurrentTempoBpm: number | null
): void {
  if (
    policy.failedRunBehavior !== 'step_down' ||
    lowestCurrentTempoBpm === null
  )
    return
  if (policy.minimumTempoBpm > lowestCurrentTempoBpm)
    throw new ConfigError(
      `PROGRESSION_MINIMUM_TEMPO_BPM (${policy.minimumTempoBpm}) must not exceed the lowest existing exercise current tempo (${lowestCurrentTempoBpm})`
    )
}
