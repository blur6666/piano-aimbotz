import { describe, expect, it } from 'vitest'
import type { ExerciseStep } from '../src/shared/contracts.js'
import {
  keyboardOctaveCount,
  resolveScaleKeys
} from '../src/client/practice/noteNames.js'

function steps(notes: readonly string[]): ExerciseStep[] {
  return notes.map((noteSpelling, stepIndex) => ({
    stepIndex,
    noteSpelling,
    fingerNumber: 1
  }))
}

describe('keyboard scale-key placement', () => {
  it('uses two keyboard octaves to contain both endpoints of a one-octave scale', () => {
    const keyboardOctaves = keyboardOctaveCount(1)
    const ascending = resolveScaleKeys(
      steps(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']),
      'ascending',
      keyboardOctaves
    )
    const descending = resolveScaleKeys(
      steps(['C', 'B', 'A', 'G', 'F', 'E', 'D', 'C']),
      'descending',
      keyboardOctaves
    )

    expect(keyboardOctaves).toBe(2)
    expect(ascending[0].octave).toBe(0)
    expect(ascending.at(-1)?.octave).toBe(1)
    expect(descending[0].octave).toBe(1)
    expect(descending.at(-1)?.octave).toBe(0)
    expect(
      [...ascending, ...descending].every(
        (key) => key.octave >= 0 && key.octave < keyboardOctaves
      )
    ).toBe(true)
  })

  it('uses three keyboard octaves to contain both endpoints of a two-octave scale', () => {
    const keyboardOctaves = keyboardOctaveCount(2)
    const ascending = resolveScaleKeys(
      steps([
        'C',
        'D',
        'E',
        'F',
        'G',
        'A',
        'B',
        'C',
        'D',
        'E',
        'F',
        'G',
        'A',
        'B',
        'C'
      ]),
      'ascending',
      keyboardOctaves
    )
    const descending = resolveScaleKeys(
      steps([
        'C',
        'B',
        'A',
        'G',
        'F',
        'E',
        'D',
        'C',
        'B',
        'A',
        'G',
        'F',
        'E',
        'D',
        'C'
      ]),
      'descending',
      keyboardOctaves
    )

    expect(keyboardOctaves).toBe(3)
    expect(ascending[0].octave).toBe(0)
    expect(ascending.at(-1)?.octave).toBe(2)
    expect(descending[0].octave).toBe(2)
    expect(descending.at(-1)?.octave).toBe(0)
    expect(
      [...ascending, ...descending].every(
        (key) => key.octave >= 0 && key.octave < keyboardOctaves
      )
    ).toBe(true)
  })
})
