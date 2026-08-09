import type { ScaleKey } from './noteNames.js'

const OCTAVE_WHITE_NOTES = [
  { note: 'C', pitchClass: 0 },
  { note: 'D', pitchClass: 2 },
  { note: 'E', pitchClass: 4 },
  { note: 'F', pitchClass: 5 },
  { note: 'G', pitchClass: 7 },
  { note: 'A', pitchClass: 9 },
  { note: 'B', pitchClass: 11 }
]

// afterWhiteIndex: sits on the boundary between that white key and the next,
// relative to the start of its own octave.
const OCTAVE_BLACK_NOTES = [
  { note: 'C#', pitchClass: 1, afterWhiteIndex: 0 },
  { note: 'D#', pitchClass: 3, afterWhiteIndex: 1 },
  { note: 'F#', pitchClass: 6, afterWhiteIndex: 3 },
  { note: 'G#', pitchClass: 8, afterWhiteIndex: 4 },
  { note: 'A#', pitchClass: 10, afterWhiteIndex: 5 }
]

export const OCTAVE_COUNT = 3

const WHITE_KEYS_PER_OCTAVE = OCTAVE_WHITE_NOTES.length
const WHITE_KEY_WIDTH_PERCENT = 100 / (OCTAVE_COUNT * WHITE_KEYS_PER_OCTAVE)

const WHITE_KEYS = Array.from({ length: OCTAVE_COUNT }, (_, octave) =>
  OCTAVE_WHITE_NOTES.map((key) => ({ ...key, octave }))
).flat()

const BLACK_KEYS = Array.from({ length: OCTAVE_COUNT }, (_, octave) =>
  OCTAVE_BLACK_NOTES.map((key) => ({
    ...key,
    octave,
    afterWhiteIndex: key.afterWhiteIndex + octave * WHITE_KEYS_PER_OCTAVE
  }))
).flat()

// Horizontal centre of a key, in percent of the keyboard width. White keys
// sit at the middle of their slot; black keys straddle the boundary between
// two white keys, which is where the rendered black key is centred too.
function keyCenterPercent(pitchClass: number, octave: number): number | null {
  const whiteIndex = OCTAVE_WHITE_NOTES.findIndex(
    (key) => key.pitchClass === pitchClass
  )
  if (whiteIndex !== -1)
    return (
      (octave * WHITE_KEYS_PER_OCTAVE + whiteIndex + 0.5) *
      WHITE_KEY_WIDTH_PERCENT
    )
  const black = OCTAVE_BLACK_NOTES.find((key) => key.pitchClass === pitchClass)
  if (!black) return null
  return (
    (octave * WHITE_KEYS_PER_OCTAVE + black.afterWhiteIndex + 1) *
    WHITE_KEY_WIDTH_PERCENT
  )
}

export type KeyboardProps = {
  scaleKeys: readonly ScaleKey[]
}

// Two-octave reference keyboard showing the selected exercise on the keys it
// actually uses, with each step's note and finger labelled beneath its own
// key. Presentation only -- nothing here feeds scoring.
export function Keyboard({ scaleKeys }: KeyboardProps) {
  const highlighted = new Set(
    scaleKeys.map((key) => `${key.octave}:${key.pitchClass}`)
  )
  const blackKeyWidthPercent = WHITE_KEY_WIDTH_PERCENT * 0.56
  return (
    <div className="keyboard-figure">
      <div className="keyboard" aria-hidden="true">
        <div className="keyboard-white-keys">
          {WHITE_KEYS.map((key) => (
            <div
              key={`${key.note}${key.octave}`}
              className={
                'keyboard-key keyboard-key-white' +
                (highlighted.has(`${key.octave}:${key.pitchClass}`)
                  ? ' keyboard-key-highlighted'
                  : '')
              }
            />
          ))}
        </div>
        {BLACK_KEYS.map((key) => (
          <div
            key={`${key.note}${key.octave}`}
            className={
              'keyboard-key keyboard-key-black' +
              (highlighted.has(`${key.octave}:${key.pitchClass}`)
                ? ' keyboard-key-highlighted'
                : '')
            }
            style={{
              left: `${(key.afterWhiteIndex + 1) * WHITE_KEY_WIDTH_PERCENT}%`,
              width: `${blackKeyWidthPercent}%`
            }}
          />
        ))}
      </div>
      <div className="keyboard-labels">
        {scaleKeys.map((key) => {
          const center = keyCenterPercent(key.pitchClass, key.octave)
          if (center === null) return null
          const isBlack = OCTAVE_BLACK_NOTES.some(
            (black) => black.pitchClass === key.pitchClass
          )
          return (
            <div
              className={
                'keyboard-label' + (isBlack ? ' keyboard-label-black' : '')
              }
              key={key.stepIndex}
              style={{ left: `${center}%` }}
            >
              <strong>{key.noteSpelling}</strong>
              <span className={key.fingerNumber == 1 ? 'thumb' : ''}>
                {key.fingerNumber}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
