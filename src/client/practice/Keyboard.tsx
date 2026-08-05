const WHITE_KEYS = [
  { note: 'C', pitchClass: 0 },
  { note: 'D', pitchClass: 2 },
  { note: 'E', pitchClass: 4 },
  { note: 'F', pitchClass: 5 },
  { note: 'G', pitchClass: 7 },
  { note: 'A', pitchClass: 9 },
  { note: 'B', pitchClass: 11 }
]

// afterWhiteIndex: sits on the boundary between that white key and the next.
const BLACK_KEYS = [
  { note: 'C#', pitchClass: 1, afterWhiteIndex: 0 },
  { note: 'D#', pitchClass: 3, afterWhiteIndex: 1 },
  { note: 'F#', pitchClass: 6, afterWhiteIndex: 3 },
  { note: 'G#', pitchClass: 8, afterWhiteIndex: 4 },
  { note: 'A#', pitchClass: 10, afterWhiteIndex: 5 }
]

export type KeyboardProps = {
  highlightedPitchClasses: Set<number>
}

// One-octave reference keyboard showing which physical keys the selected
// scale uses (TODO in BACKLOG.md). Presentation only -- highlighting is by
// pitch class, not by scale step order or fingering.
export function Keyboard({ highlightedPitchClasses }: KeyboardProps) {
  const whiteKeyWidthPercent = 100 / WHITE_KEYS.length
  return (
    <div className="keyboard" aria-hidden="true">
      <div className="keyboard-white-keys">
        {WHITE_KEYS.map((key) => (
          <div
            key={key.note}
            className={
              'keyboard-key keyboard-key-white' +
              (highlightedPitchClasses.has(key.pitchClass)
                ? ' keyboard-key-highlighted'
                : '')
            }
          />
        ))}
      </div>
      {BLACK_KEYS.map((key) => (
        <div
          key={key.note}
          className={
            'keyboard-key keyboard-key-black' +
            (highlightedPitchClasses.has(key.pitchClass)
              ? ' keyboard-key-highlighted'
              : '')
          }
          style={{
            left: `${(key.afterWhiteIndex + 1) * whiteKeyWidthPercent}%`
          }}
        />
      ))}
    </div>
  )
}
