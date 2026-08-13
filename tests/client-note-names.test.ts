import { describe, expect, it } from 'vitest'
import type { ExerciseStep } from '../src/shared/contracts.js'
import {
  FULL_KEYBOARD_BLACK_KEYS,
  FULL_KEYBOARD_TOTAL_KEYS,
  FULL_KEYBOARD_WHITE_KEYS,
  keyboardOctaveCount,
  MIDDLE_C_OCTAVE_INDEX,
  nearestFullKeyboardPlacement,
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

const SCALES: Record<string, string[]> = {
  'C major': ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
  'G major': ['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G'],
  'D major': ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'D'],
  'A major': ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#', 'A'],
  'E major': ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#', 'E'],
  'B major': ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#', 'B'],
  'F major': ['F', 'G', 'A', 'Bb', 'C', 'D', 'E', 'F'],
  'Bb major': ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
  'Eb major': ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb'],
  'Ab major': ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G', 'Ab'],
  'Db major': ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C', 'Db'],
  'Gb major': ['Gb', 'Ab', 'Bb', 'B', 'Db', 'Eb', 'F', 'Gb']
}

function fullSteps(notes: readonly string[]): ExerciseStep[] {
  return notes.map((noteSpelling, stepIndex) => ({
    stepIndex,
    noteSpelling,
    fingerNumber: 1
  }))
}

// One-octave lists hold 8 notes (both tonics); N octaves repeat the inner
// seven, matching the seeded exercise-step shape (7N + 1 notes).
function scaleStepsForOctaves(
  notes: readonly string[],
  octaves: number
): ExerciseStep[] {
  const expanded = Array.from({ length: octaves }, (_, index) =>
    index === 0 ? notes : notes.slice(1)
  ).flat()
  return fullSteps(expanded)
}

function exerciseSteps(
  notes: readonly string[],
  direction: 'ascending' | 'descending',
  octaves: number
): ExerciseStep[] {
  const expanded = scaleStepsForOctaves(notes, octaves).map(
    (step) => step.noteSpelling
  )
  const ordered = direction === 'ascending' ? expanded : [...expanded].reverse()
  return fullSteps(ordered)
}

describe('fullscreen-landscape keyboard', () => {
  it('is five octaves plus one key = 61 keys, with C4 as middle C', () => {
    expect(FULL_KEYBOARD_TOTAL_KEYS).toBe(61)
    expect(FULL_KEYBOARD_WHITE_KEYS).toBe(36)
    expect(FULL_KEYBOARD_BLACK_KEYS).toBe(25)
    expect(MIDDLE_C_OCTAVE_INDEX).toBe(2)
  })

  it('anchors C major ascending on middle C', () => {
    const placement = nearestFullKeyboardPlacement(
      fullSteps(SCALES['C major']),
      'ascending',
      1
    )
    expect(placement?.tonicOctave).toBe(MIDDLE_C_OCTAVE_INDEX)
    expect(placement?.scaleKeys[0].pitchClass).toBe(0)
    expect(placement?.scaleKeys[0].octave).toBe(MIDDLE_C_OCTAVE_INDEX)
    expect(placement?.scaleKeys.at(-1)?.octave).toBe(MIDDLE_C_OCTAVE_INDEX + 1)
  })

  it('contains both endpoints of one- and two-octave scales', () => {
    for (const notes of Object.values(SCALES))
      for (const octaves of [1, 2])
        for (const direction of ['ascending', 'descending'] as const) {
          const placement = nearestFullKeyboardPlacement(
            exerciseSteps(notes, direction, octaves),
            direction,
            octaves
          )
          expect(placement).not.toBeNull()
          const min = Math.min(...placement!.scaleKeys.map((key) => key.octave))
          const max = Math.max(...placement!.scaleKeys.map((key) => key.octave))
          expect(min).toBeGreaterThanOrEqual(0)
          expect(max).toBe(min + octaves)
          expect(max).toBeLessThanOrEqual(5)
        }
  })

  it('picks the tonic nearest middle C, left or right', () => {
    const ascending = nearestFullKeyboardPlacement(
      exerciseSteps(SCALES['F major'], 'ascending', 1),
      'ascending',
      1
    )
    // F4 is 7 semitones below middle C; every other F tonic is farther.
    expect(ascending?.tonicOctave).toBe(MIDDLE_C_OCTAVE_INDEX)

    const descending = nearestFullKeyboardPlacement(
      exerciseSteps(SCALES['G major'], 'descending', 1),
      'descending',
      1
    )
    // G3 is 5 semitones below middle C, G4 is 7 above.
    expect(descending?.tonicOctave).toBe(MIDDLE_C_OCTAVE_INDEX - 1)
  })

  it('randomizes an equally close tie between left and right', () => {
    const notes = fullSteps(SCALES['Gb major'])
    // Gb3 and Gb4 are both exactly 6 semitones from middle C.
    const left = nearestFullKeyboardPlacement(notes, 'ascending', 1, () => 0)
    const right = nearestFullKeyboardPlacement(
      notes,
      'ascending',
      1,
      () => 0.999
    )
    expect(left?.tonicOctave).toBe(MIDDLE_C_OCTAVE_INDEX - 1)
    expect(right?.tonicOctave).toBe(MIDDLE_C_OCTAVE_INDEX)
  })

  it('never places a key past the final C7 key', () => {
    for (const notes of Object.values(SCALES))
      for (const octaves of [1, 2])
        for (const direction of ['ascending', 'descending'] as const) {
          const placement = nearestFullKeyboardPlacement(
            exerciseSteps(notes, direction, octaves),
            direction,
            octaves
          )
          for (const key of placement!.scaleKeys) {
            expect(key.octave).toBeLessThanOrEqual(5)
            if (key.octave === 5) expect(key.pitchClass).toBe(0)
          }
        }
  })
})
