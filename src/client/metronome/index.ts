export type MetronomeHandle = {
  audio: AudioContext
  firstExpectedBeat: number
  beatMs: number
}

// Samples performance.now() and AudioContext.currentTime together, then
// converts the scheduled first-beat audio time through that sampled pair
// into a DOMHighResTimeStamp. AudioContext.currentTime is never subtracted
// directly from a MIDI event timestamp elsewhere in the client.
export function scheduleMetronome(
  tempoBpm: number,
  countInBeats: number,
  scaleBeats: number,
  onBeatChange: (label: string) => void
): MetronomeHandle {
  const beatMs = 60_000 / tempoBpm
  const audio = new AudioContext()
  const audioTimeAtSample = audio.currentTime
  const performanceTimeAtSample = performance.now()
  const audioFirstBeatTime = audioTimeAtSample + (countInBeats * beatMs) / 1000
  const firstExpectedBeat =
    performanceTimeAtSample + (audioFirstBeatTime - audioTimeAtSample) * 1000

  const click = (when: number, accent: boolean) => {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.frequency.value = accent ? 880 : 660
    gain.gain.setValueAtTime(accent ? 0.35 : 0.25, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(when)
    oscillator.stop(when + 0.09)
  }

  // One extra scheduled beat past the eighth expected note, so the capture
  // window (aligned to this same beat count by the caller) can retain the
  // final note-off.
  const totalBeats = countInBeats + scaleBeats + 1
  for (let index = 0; index < totalBeats; index += 1) {
    const when = audioTimeAtSample + (index * beatMs) / 1000
    click(when, index % 4 === 0)
    window.setTimeout(() => {
      if (index < countInBeats) onBeatChange(`Count-in: ${index + 1}/4`)
      else if (index < countInBeats + scaleBeats) {
        const scaleBeat = index - countInBeats
        const bar = Math.floor(scaleBeat / 4) + 1
        onBeatChange(`Scale ${bar}: ${(scaleBeat % 4) + 1}/4`)
      } else onBeatChange('Finishing')
    }, index * beatMs)
  }

  return { audio, firstExpectedBeat, beatMs }
}
