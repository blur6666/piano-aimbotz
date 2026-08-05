import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/server/config.js'

const validEnv = {
  SCORING_TIMING_TOLERANCE_US: '50000',
  SCORING_OVERLAP_TOLERANCE_US: '0',
  SCORING_MAX_TIMING_FAULTS_PER_RUN: '0',
  SCORING_MAX_OVERLAP_FAULTS_PER_RUN: '0',
  SCORING_RECOVERY_WINDOW_STEPS: '1',
  PROGRESSION_TEMPO_INCREMENT_BPM: '4',
  PROGRESSION_FAILED_RUN_BEHAVIOR: 'reset_streak',
  SEED_INITIAL_TEMPO_BPM: '60'
}

describe('loadConfig', () => {
  it('loads a valid reset_streak configuration', () => {
    const config = loadConfig(validEnv)
    expect(config.progression.failedRunBehavior).toBe('reset_streak')
    expect(config.seedInitialTempoBpm).toBe(60)
  })

  it('throws when a required value is missing', () => {
    const { SCORING_TIMING_TOLERANCE_US: _omit, ...rest } = validEnv
    expect(() => loadConfig(rest)).toThrow(/SCORING_TIMING_TOLERANCE_US/)
  })

  it('throws when a numeric value is not an integer', () => {
    expect(() =>
      loadConfig({ ...validEnv, SCORING_TIMING_TOLERANCE_US: 'not-a-number' })
    ).toThrow()
  })

  it('requires step_down-specific values when that behavior is selected', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        PROGRESSION_FAILED_RUN_BEHAVIOR: 'step_down'
      })
    ).toThrow(/PROGRESSION_TEMPO_DECREMENT_BPM/)
  })

  it('loads a valid step_down configuration', () => {
    const config = loadConfig({
      ...validEnv,
      PROGRESSION_FAILED_RUN_BEHAVIOR: 'step_down',
      PROGRESSION_TEMPO_DECREMENT_BPM: '4',
      PROGRESSION_MINIMUM_TEMPO_BPM: '40'
    })
    expect(config.progression).toEqual({
      cleanRunsRequired: 3,
      tempoIncrementBpm: 4,
      failedRunBehavior: 'step_down',
      tempoDecrementBpm: 4,
      minimumTempoBpm: 40
    })
  })

  it('rejects a minimum tempo above the configured initial tempo', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        PROGRESSION_FAILED_RUN_BEHAVIOR: 'step_down',
        PROGRESSION_TEMPO_DECREMENT_BPM: '4',
        PROGRESSION_MINIMUM_TEMPO_BPM: '90'
      })
    ).toThrow(/must not exceed/)
  })
})
