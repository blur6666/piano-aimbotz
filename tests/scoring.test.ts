import { describe, expect, it } from 'vitest'
import { countHardFaults } from '../src/domain/scoring.js'

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
