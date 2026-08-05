import type { ProgressionPolicy, ProgressionSnapshot } from '../policy.js'

export const POLICY_VERSION = 'v1'

export function applyProgression(
  snapshot: ProgressionSnapshot,
  passed: boolean,
  policy: ProgressionPolicy
): ProgressionSnapshot {
  if (!passed) {
    if (policy.failedRunBehavior === 'reset_streak')
      return {
        currentTempoBpm: snapshot.currentTempoBpm,
        consecutiveCleanRuns: 0
      }
    return {
      currentTempoBpm: Math.max(
        policy.minimumTempoBpm,
        snapshot.currentTempoBpm - policy.tempoDecrementBpm
      ),
      consecutiveCleanRuns: 0
    }
  }
  const consecutiveCleanRuns = snapshot.consecutiveCleanRuns + 1
  if (consecutiveCleanRuns >= policy.cleanRunsRequired)
    return {
      currentTempoBpm: snapshot.currentTempoBpm + policy.tempoIncrementBpm,
      consecutiveCleanRuns: 0
    }
  return { currentTempoBpm: snapshot.currentTempoBpm, consecutiveCleanRuns }
}
