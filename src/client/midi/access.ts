export async function requestMidiInputs(): Promise<MIDIInput[]> {
  if (!navigator.requestMIDIAccess)
    throw new Error(
      'Web MIDI is unavailable. Use desktop Chrome or Edge over localhost/HTTPS.'
    )
  const access = await navigator.requestMIDIAccess({ sysex: false })
  return [...access.inputs.values()]
}
