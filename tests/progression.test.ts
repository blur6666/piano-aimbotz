import { describe, expect, it } from 'vitest'
import {
  applyProgressionVersion,
  replayProgression,
  CURRENT_PROGRESSION_VERSION,
  type ProgressionPolicy,
  type ProgressionSnapshot
} from '../src/domain/progression/index.js'

const resetStreakPolicy: ProgressionPolicy = {
  cleanRunsRequired: 3,
  tempoIncrementBpm: 4,
  failedRunBehavior: 'reset_streak'
}

const stepDownPolicy: ProgressionPolicy = {
  cleanRunsRequired: 3,
  tempoIncrementBpm: 4,
  failedRunBehavior: 'step_down',
  tempoDecrementBpm: 8,
  minimumTempoBpm: 40
}

describe('progression policy', () => {
  it('advances tempo and resets the streak after three consecutive clean runs', () => {
    let snapshot: ProgressionSnapshot = {
      currentTempoBpm: 60,
      consecutiveCleanRuns: 0
    }
    snapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      snapshot,
      true,
      resetStreakPolicy
    )
    expect(snapshot).toEqual({ currentTempoBpm: 60, consecutiveCleanRuns: 1 })
    snapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      snapshot,
      true,
      resetStreakPolicy
    )
    expect(snapshot).toEqual({ currentTempoBpm: 60, consecutiveCleanRuns: 2 })
    snapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      snapshot,
      true,
      resetStreakPolicy
    )
    expect(snapshot).toEqual({ currentTempoBpm: 64, consecutiveCleanRuns: 0 })
  })

  it('reset_streak keeps tempo and zeroes the streak on a failed run', () => {
    const snapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      { currentTempoBpm: 60, consecutiveCleanRuns: 2 },
      false,
      resetStreakPolicy
    )
    expect(snapshot).toEqual({ currentTempoBpm: 60, consecutiveCleanRuns: 0 })
  })

  it('step_down decrements tempo and zeroes the streak on a failed run', () => {
    const snapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      { currentTempoBpm: 60, consecutiveCleanRuns: 2 },
      false,
      stepDownPolicy
    )
    expect(snapshot).toEqual({ currentTempoBpm: 52, consecutiveCleanRuns: 0 })
  })

  it('step_down clamps at the configured minimum and never increases tempo on failure', () => {
    const snapshot = applyProgressionVersion(
      CURRENT_PROGRESSION_VERSION,
      { currentTempoBpm: 44, consecutiveCleanRuns: 1 },
      false,
      stepDownPolicy
    )
    expect(snapshot).toEqual({ currentTempoBpm: 40, consecutiveCleanRuns: 0 })
  })

  it('rejects an unregistered progression policy version', () => {
    expect(() =>
      applyProgressionVersion(
        'does-not-exist',
        { currentTempoBpm: 60, consecutiveCleanRuns: 0 },
        true,
        resetStreakPolicy
      )
    ).toThrow()
  })

  it('rebuild-equivalence: replaying from initial state matches incremental application', () => {
    const results = [true, true, false, true, true, true, false, true]
    const assessments = results.map((passed) => ({
      passed,
      progressionPolicyVersion: CURRENT_PROGRESSION_VERSION,
      progressionParameters: resetStreakPolicy
    }))

    let incremental: ProgressionSnapshot = {
      currentTempoBpm: 60,
      consecutiveCleanRuns: 0
    }
    for (const assessment of assessments)
      incremental = applyProgressionVersion(
        assessment.progressionPolicyVersion,
        incremental,
        assessment.passed,
        assessment.progressionParameters
      )

    const rebuilt = replayProgression(60, assessments)

    expect(rebuilt).toEqual(incremental)
  })
})
