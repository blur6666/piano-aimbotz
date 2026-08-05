export type ProgressionSnapshot = {
  currentTempoBpm: number
  consecutiveCleanRuns: number
}

export type ProgressionPolicy =
  | {
      cleanRunsRequired: 3
      tempoIncrementBpm: number
      failedRunBehavior: 'reset_streak'
    }
  | {
      cleanRunsRequired: 3
      tempoIncrementBpm: number
      failedRunBehavior: 'step_down'
      tempoDecrementBpm: number
      minimumTempoBpm: number
    }
