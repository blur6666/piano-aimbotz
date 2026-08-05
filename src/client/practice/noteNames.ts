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

export function pitchClassesForNoteSpellings(
  noteSpellings: readonly string[]
): Set<number> {
  const classes = new Set<number>()
  for (const spelling of noteSpellings) {
    const pitchClass = PITCH_CLASS_BY_SPELLING[spelling]
    if (pitchClass !== undefined) classes.add(pitchClass)
  }
  return classes
}
