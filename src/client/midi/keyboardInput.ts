// Computer-keyboard-as-piano input (BACKLOG.md): A-K on the home row are
// the white keys of one octave (C4-C5), with the black keys on the row
// above -- the same layout convention used by GarageBand/Ableton-style
// virtual keyboards.
//
//   W E   T Y U      <- black keys (C# D#  F# G# A#)
//   A S D F G H J K  <- white keys (C  D  E  F  G  A  B  C)
//
// Emits the exact same message shape startCapture already parses
// (status byte 0x90/0x80, pitch, velocity), so this is a drop-in
// alternative to a real MIDIInput -- the rest of the capture/scoring
// pipeline neither knows nor cares where the events came from.
const KEY_TO_SEMITONE_OFFSET: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12
}

// C4 on the "A" key, matching the MIDI pitch 60 used as tonic pitch class
// 0 throughout the rest of this app (see tests/scoring.test.ts, seed
// data).
const BASE_MIDI_PITCH = 60

export type FakeMidiMessage = { data: Uint8Array; timeStamp: number }
export type FakeMidiInput = {
  onmidimessage: ((message: FakeMidiMessage) => void) | null
}

export function createKeyboardInput(): {
  input: FakeMidiInput
  dispose: () => void
} {
  const input: FakeMidiInput = { onmidimessage: null }
  const held = new Set<string>()

  function send(pitch: number, on: boolean): void {
    input.onmidimessage?.({
      data: Uint8Array.from([on ? 0x90 : 0x80, pitch, on ? 100 : 0]),
      timeStamp: performance.now()
    })
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return
    const key = event.key.toLowerCase()
    const offset = KEY_TO_SEMITONE_OFFSET[key]
    if (offset === undefined || held.has(key)) return
    held.add(key)
    send(BASE_MIDI_PITCH + offset, true)
  }

  function handleKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase()
    const offset = KEY_TO_SEMITONE_OFFSET[key]
    if (offset === undefined) return
    held.delete(key)
    send(BASE_MIDI_PITCH + offset, false)
  }

  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)

  return {
    input,
    dispose: () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }
}
