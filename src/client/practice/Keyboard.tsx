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

const WHITE_KEYS_PER_OCTAVE = OCTAVE_WHITE_NOTES.length

// Horizontal centre of a key, in percent of the keyboard width. White keys
// sit at the middle of their slot; black keys straddle the boundary between
// two white keys, which is where the rendered black key is centred too.
function keyCenterPercent(
  pitchClass: number,
  octave: number,
  whiteKeyWidthPercent: number
): number | null {
  const whiteIndex = OCTAVE_WHITE_NOTES.findIndex(
    (key) => key.pitchClass === pitchClass
  )
  if (whiteIndex !== -1)
    return (
      (octave * WHITE_KEYS_PER_OCTAVE + whiteIndex + 0.5) * whiteKeyWidthPercent
    )
  const black = OCTAVE_BLACK_NOTES.find((key) => key.pitchClass === pitchClass)
  if (!black) return null
  return (
    (octave * WHITE_KEYS_PER_OCTAVE + black.afterWhiteIndex + 1) *
    whiteKeyWidthPercent
  )
}

export type KeyboardProps = {
  scaleKeys: readonly ScaleKey[]
  // Span of the drawn C-to-C keyboard: 2 octaves for a one-octave exercise,
  // and 3 for a two-octave exercise, so both tonic endpoints fit.
  octaves: number
}

// Reference keyboard showing the selected exercise on the keys it actually
// uses, with each step's note and finger labelled beneath its own key.
// Presentation only -- nothing here feeds scoring.
export function Keyboard({ scaleKeys, octaves }: KeyboardProps) {
  const whiteKeyWidthPercent = 100 / (octaves * WHITE_KEYS_PER_OCTAVE)
  const whiteKeys = Array.from({ length: octaves }, (_, octave) =>
    OCTAVE_WHITE_NOTES.map((key) => ({ ...key, octave }))
  ).flat()
  const blackKeys = Array.from({ length: octaves }, (_, octave) =>
    OCTAVE_BLACK_NOTES.map((key) => ({
      ...key,
      octave,
      afterWhiteIndex: key.afterWhiteIndex + octave * WHITE_KEYS_PER_OCTAVE
    }))
  ).flat()
  const highlighted = new Set(
    scaleKeys.map((key) => `${key.octave}:${key.pitchClass}`)
  )
  const blackKeyWidthPercent = whiteKeyWidthPercent * 0.56
  return (
    <div className="keyboard-figure">
      <div className="keyboard" aria-hidden="true">
        <div className="keyboard-white-keys">
          {whiteKeys.map((key) => (
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
        {blackKeys.map((key) => (
          <div
            key={`${key.note}${key.octave}`}
            className={
              'keyboard-key keyboard-key-black' +
              (highlighted.has(`${key.octave}:${key.pitchClass}`)
                ? ' keyboard-key-highlighted'
                : '')
            }
            style={{
              left: `${(key.afterWhiteIndex + 1) * whiteKeyWidthPercent}%`,
              width: `${blackKeyWidthPercent}%`
            }}
          />
        ))}
      </div>
      <div className="keyboard-labels">
        {scaleKeys.map((key) => {
          const center = keyCenterPercent(
            key.pitchClass,
            key.octave,
            whiteKeyWidthPercent
          )
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
