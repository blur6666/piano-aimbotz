import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/server/config.js'

const validEnv = {
  SCORING_TIMING_TOLERANCE_NOTE_FRACTION: '0.10',
  SCORING_OVERLAP_TOLERANCE_US: '30000',
  SCORING_MAX_TIMING_FAULTS_PER_RUN: '0',
  SCORING_RECOVERY_WINDOW_STEPS: '1',
  EXERCISE_NOTES_PER_BEAT: '2',
  PROGRESSION_TEMPO_INCREMENT_BPM: '4',
  PROGRESSION_FAILED_RUN_BEHAVIOR: 'reset_streak',
  RECOMMENDATION_CLEAR_OCTAVES: '1',
  RECOMMENDATION_CLEAR_DIRECTIONS: 'ascending,descending',
  SEED_INITIAL_TEMPO_BPM: '60'
}

describe('loadConfig', () => {
  it('loads a valid reset_streak configuration', () => {
    const config = loadConfig(validEnv)
    expect(config.progression.failedRunBehavior).toBe('reset_streak')
    expect(config.seedInitialTempoBpm).toBe(60)
    expect(config.scoring.timingToleranceNoteFraction).toBe(0.1)
  })

  it('parses the recommendation clear condition', () => {
    const config = loadConfig(validEnv)
    expect(config.recommendation).toEqual({
      clearOctaves: 1,
      clearDirections: ['ascending', 'descending']
    })
  })

  it('accepts a single-direction clear condition', () => {
    const config = loadConfig({
      ...validEnv,
      RECOMMENDATION_CLEAR_DIRECTIONS: 'ascending'
    })
    expect(config.recommendation.clearDirections).toEqual(['ascending'])
  })

  it('rejects an unknown direction', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        RECOMMENDATION_CLEAR_DIRECTIONS: 'ascending,sideways'
      })
    ).toThrow(/RECOMMENDATION_CLEAR_DIRECTIONS/)
  })

  it('rejects a duplicated direction', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        RECOMMENDATION_CLEAR_DIRECTIONS: 'ascending,ascending'
      })
    ).toThrow(/duplicate/)
  })

  it('rejects an octave count the catalog cannot supply', () => {
    // 3 would leave every scale permanently and silently uncleared.
    expect(() =>
      loadConfig({ ...validEnv, RECOMMENDATION_CLEAR_OCTAVES: '3' })
    ).toThrow(/RECOMMENDATION_CLEAR_OCTAVES/)
  })

  it('throws when a required value is missing', () => {
    const { SCORING_TIMING_TOLERANCE_NOTE_FRACTION: _omit, ...rest } = validEnv
    expect(() => loadConfig(rest)).toThrow(
      /SCORING_TIMING_TOLERANCE_NOTE_FRACTION/
    )
  })

  it('throws when a numeric value is not a number', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SCORING_TIMING_TOLERANCE_NOTE_FRACTION: 'not-a-number'
      })
    ).toThrow()
  })

  // Half a beat of tolerance would let a note landing nearer the next beat
  // than its own still pass, which makes the measurement meaningless.
  it('rejects a timing tolerance beyond half a beat', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SCORING_TIMING_TOLERANCE_NOTE_FRACTION: '0.6'
      })
    ).toThrow(/between 0 and 0.5/)
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
