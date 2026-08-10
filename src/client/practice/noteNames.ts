import type { ExerciseStep } from '../../shared/contracts.js'

// Client-side note-spelling -> pitch-class lookup, for highlighting scale
// notes on the on-screen keyboard. Presentation-only; scoring's own
// pitch-class handling lives in src/domain (see AGENTS.md -- domain stays
// server-side and this must not duplicate its authority over scoring).
const PITCH_CLASS_BY_SPELLING: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
}

// A single exercise step placed on a concrete key of the on-screen keyboard.
// `octave` is an index into the rendered octaves, not a scientific octave
// number -- octave 0 is the leftmost C of the drawn keyboard.
export type ScaleKey = {
  stepIndex: number
  noteSpelling: string
  fingerNumber: number
  pitchClass: number
  octave: number
}

// The fullscreen-landscape keyboard (docs/BACKLOG.md): five octaves plus the
// final tonic key = 61 keys, C2 through C7. Middle C is C4, the key at
// keyboard octave index 2.
export const FULL_KEYBOARD_OCTAVES = 5
export const FULL_KEYBOARD_TOTAL_KEYS = FULL_KEYBOARD_OCTAVES * 12 + 1 // 61
export const FULL_KEYBOARD_WHITE_KEYS = FULL_KEYBOARD_OCTAVES * 7 + 1 // 36
export const FULL_KEYBOARD_BLACK_KEYS = FULL_KEYBOARD_OCTAVES * 5 // 25
export const MIDDLE_C_OCTAVE_INDEX = 2 // C4

// A scale placed on the full 61-key keyboard: the 0-based octave index of its
// tonic and every step resolved to a concrete key of that range.
export type FullKeyboardPlacement = {
  tonicOctave: number
  scaleKeys: ScaleKey[]
}

// A scale spans N octave intervals but includes both tonic endpoints, so the
// C-to-C reference keyboard needs one additional drawn octave to contain it.
export function keyboardOctaveCount(exerciseOctaves: number): number {
  return exerciseOctaves + 1
}

function resolveScaleKeysFrom(
  steps: readonly ExerciseStep[],
  direction: 'ascending' | 'descending',
  startOctave: number
): ScaleKey[] {
  const ascending = direction === 'ascending'
  let octave = startOctave
  let previousPitchClass: number | null = null
  const keys: ScaleKey[] = []
  for (const step of steps) {
    const pitchClass = PITCH_CLASS_BY_SPELLING[step.noteSpelling]
    if (pitchClass === undefined) continue
    if (previousPitchClass !== null) {
      if (ascending && pitchClass <= previousPitchClass) octave += 1
      else if (!ascending && pitchClass >= previousPitchClass) octave -= 1
    }
    previousPitchClass = pitchClass
    keys.push({
      stepIndex: step.stepIndex,
      noteSpelling: step.noteSpelling,
      fingerNumber: step.fingerNumber,
      pitchClass,
      octave
    })
  }
  return keys
}

// Exercise steps carry only a spelling and a finger, no MIDI pitch, but a
// scale run is monotonic: each ascending step is higher than the one before
// it. So a wrap in pitch class (C after B going up, B after C going down)
// is exactly where the octave changes. That is what lets an F-to-F scale
// occupy its real span across the two drawn octaves instead of being
// smeared over every matching pitch class.
export function resolveScaleKeys(
  steps: readonly ExerciseStep[],
  direction: 'ascending' | 'descending',
  octaveCount: number
): ScaleKey[] {
  const ascending = direction === 'ascending'
  return resolveScaleKeysFrom(steps, direction, ascending ? 0 : octaveCount - 1)
}

// Fullscreen-landscape placement (docs/BACKLOG.md): start the scale on the
// valid tonic key closest to middle C (C4), left or right, whichever is
// closest. Two tonics equally close tie at random -- presentation only, it
// never affects scoring or progression. `random` is injected so tests can
// drive the tie deterministically.
export function nearestFullKeyboardPlacement(
  steps: readonly ExerciseStep[],
  direction: 'ascending' | 'descending',
  exerciseOctaves: number,
  random: () => number = Math.random
): FullKeyboardPlacement | null {
  const ascending = direction === 'ascending'
  const tonicPitchClass =
    steps.length > 0
      ? PITCH_CLASS_BY_SPELLING[steps[0].noteSpelling]
      : undefined
  const lastPitchClass =
    steps.length > 0
      ? PITCH_CLASS_BY_SPELLING[steps[steps.length - 1].noteSpelling]
      : undefined
  if (tonicPitchClass === undefined || lastPitchClass === undefined) return null

  // Valid tonic octave indices: the whole scale must fit inside the C2..C7
  // keyboard. The final (partial) octave holds only the top C, so any scale
  // that does not end on C may not climb into it.
  const minT = ascending ? 0 : exerciseOctaves
  const maxT = ascending
    ? (lastPitchClass === 0
        ? FULL_KEYBOARD_OCTAVES
        : FULL_KEYBOARD_OCTAVES - 1) - exerciseOctaves
    : tonicPitchClass === 0
      ? FULL_KEYBOARD_OCTAVES
      : FULL_KEYBOARD_OCTAVES - 1

  // Keyboard octave index t is scientific octave t + 2, so its MIDI pitch is
  // (t + 3) * 12 + pitchClass. Distance to middle C (MIDI 60) is then
  // |12t + pitchClass - 24| semitones.
  let bestDistance = Infinity
  const candidates: number[] = []
  for (let t = minT; t <= maxT; t++) {
    const distance = Math.abs(12 * t + tonicPitchClass - 24)
    if (distance < bestDistance) {
      bestDistance = distance
      candidates.length = 0
      candidates.push(t)
    } else if (distance === bestDistance) {
      candidates.push(t)
    }
  }
  if (candidates.length === 0) return null
  const chosen =
    candidates[
      Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
    ]

  return {
    tonicOctave: chosen,
    scaleKeys: resolveScaleKeysFrom(steps, direction, chosen)
  }
}
