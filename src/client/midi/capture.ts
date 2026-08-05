import type { MidiEvent } from '../../shared/contracts.js'
import { readableMidiNote } from './format.js'

export type CaptureHandle = {
  events: MidiEvent[]
  stop: () => void
}

// The only module allowed to touch Web MIDI. `firstExpectedBeat` and every
// MIDIMessageEvent.timeStamp share the DOM performance time origin, so their
// difference is a safe offset without going through AudioContext.currentTime.
export function startCapture(
  input: MIDIInput,
  firstExpectedBeat: number
): CaptureHandle {
  const events: MidiEvent[] = []
  let sequence = 0
  input.onmidimessage = (message) => {
    if (!message.data) return
    const [statusByte, pitch, velocity] = Array.from(message.data)
    const command = statusByte & 0xf0
    if (command !== 0x90 && command !== 0x80) return
    const type = command === 0x90 && velocity !== 0 ? 'note_on' : 'note_off'
    const offsetUs = Math.round((message.timeStamp - firstExpectedBeat) * 1000)
    events.push({
      sequenceNumber: sequence++,
      offsetUs,
      type,
      midiPitch: pitch,
      velocity
    })
    console.debug(
      `[MIDI] ${type === 'note_on' ? 'note-on ' : 'note-off '}${readableMidiNote(pitch)} velocity=${velocity} offset=${(offsetUs / 1000).toFixed(1)}ms`
    )
  }
  return {
    events,
    stop: () => {
      input.onmidimessage = null
    }
  }
}
