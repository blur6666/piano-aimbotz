const noteNames = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B'
]

// Compact form for display in the UI: 'F4'.
export function midiNoteName(pitch: number): string {
  return `${noteNames[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}

// Verbose form for console/debug output, which wants the raw pitch too.
export function readableMidiNote(pitch: number): string {
  return `${midiNoteName(pitch)} (${pitch})`
}
