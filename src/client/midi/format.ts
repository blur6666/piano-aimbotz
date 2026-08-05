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

export function readableMidiNote(pitch: number): string {
  return `${noteNames[pitch % 12]}${Math.floor(pitch / 12) - 1} (${pitch})`
}
