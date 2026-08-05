import type { ScoringConfig } from '../domain/scoring.js'
import type { ProgressionPolicy } from '../domain/progression/index.js'

export type AppConfig = {
  scoring: ScoringConfig
  progression: ProgressionPolicy
  seedInitialTempoBpm: number
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
    timingToleranceUs: requireInt(env, 'SCORING_TIMING_TOLERANCE_US', {
      min: 0
    }),
    overlapToleranceUs: requireInt(env, 'SCORING_OVERLAP_TOLERANCE_US', {
      min: 0
    }),
    maxTimingFaultsPerRun: requireInt(
      env,
      'SCORING_MAX_TIMING_FAULTS_PER_RUN',
      { min: 0 }
    ),
    maxOverlapFaultsPerRun: requireInt(
      env,
      'SCORING_MAX_OVERLAP_FAULTS_PER_RUN',
      { min: 0 }
    ),
    recoveryWindowSteps: requireInt(env, 'SCORING_RECOVERY_WINDOW_STEPS', {
      min: 0
    })
  }

  const seedInitialTempoBpm = requireInt(env, 'SEED_INITIAL_TEMPO_BPM', {
    min: 1
  })
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

  return { scoring, progression, seedInitialTempoBpm }
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
