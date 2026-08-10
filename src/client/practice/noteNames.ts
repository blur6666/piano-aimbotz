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
  let octave = ascending ? 0 : octaveCount - 1
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
