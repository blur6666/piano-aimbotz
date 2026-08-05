import { describe, expect, it } from 'vitest'
import { countHardFaults, scoreRun } from '../src/domain/scoring.js'

const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
const cMajorOffsets = cMajor.map((pitch) => pitch - 60)

describe('Stage 1 hard faults', () => {
  it('counts only note-ons that are not the next expected note', () => {
    expect(
      countHardFaults(0, cMajorOffsets, [
        { type: 'note_on', midiPitch: 60 },
        { type: 'note_on', midiPitch: 61 },
        { type: 'note_off', midiPitch: 60 },
        ...cMajor
          .slice(1)
          .map((midiPitch) => ({ type: 'note_on' as const, midiPitch }))
      ])
    ).toBe(1)
  })

  it('continues after a wrong note and counts duplicates', () => {
    expect(
      countHardFaults(0, cMajorOffsets, [
        ...cMajor
          .slice(0, 3)
          .map((midiPitch) => ({ type: 'note_on' as const, midiPitch })),
        { type: 'note_on', midiPitch: 64 },
        ...cMajor
          .slice(3)
          .map((midiPitch) => ({ type: 'note_on' as const, midiPitch }))
      ])
    ).toBe(1)
  })

  it('anchors the octave from the first correct tonic', () => {
    expect(
      countHardFaults(
        0,
        cMajorOffsets,
        cMajor.map((pitch) => ({
          type: 'note_on' as const,
          midiPitch: pitch - 12
        }))
      )
    ).toBe(0)
  })
})

describe('descending exercises', () => {
  // The `direction` field is not read anywhere inside scoreRun -- matching
  // is driven entirely by each step's stored semitone offset. This proves
  // the scorer already handles a descending exercise correctly, even
  // though nothing in the seed/catalog can create one yet.
  it('scores a clean descending run with zero hard faults', () => {
    // C major descending, anchored on the upper C: C B A G F E D C
    const descendingOffsets = [0, -1, -3, -5, -7, -8, -10, -12]
    const anchorPitch = 72 // upper C
    const config = {
      timingToleranceUs: Number.MAX_SAFE_INTEGER,
      overlapToleranceUs: Number.MAX_SAFE_INTEGER,
      maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
      maxOverlapFaultsPerRun: Number.MAX_SAFE_INTEGER,
      recoveryWindowSteps: 0
    }
    const assessment = scoreRun({
      exercise: {
        direction: 'descending',
        tonicPitchClass: 0,
        steps: descendingOffsets.map((semitoneOffset, stepIndex) => ({
          stepIndex,
          semitoneOffset,
          fingerNumber: 1
        }))
      },
      tempoBpm: 60,
      events: descendingOffsets.map((offset, index) => ({
        sequenceNumber: index,
        offsetUs: index * 1_000_000,
        type: 'note_on' as const,
        midiPitch: anchorPitch + offset,
        velocity: 100
      })),
      config,
      algorithmVersion: 'test'
    })

    expect(assessment.summary.hardFaultCount).toBe(0)
    expect(assessment.steps.map((step) => step.expectedMidiPitch)).toEqual([
      72, 71, 69, 67, 65, 64, 62, 60
    ])
    expect(assessment.steps.every((step) => !step.missed)).toBe(true)
  })
})
