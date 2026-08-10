export type MetronomeHandle = {
  audio: AudioContext
  firstExpectedBeat: number
  beatMs: number
}

// Samples performance.now() and AudioContext.currentTime together, then
// converts the scheduled first-beat audio time through that sampled pair
// into a DOMHighResTimeStamp. AudioContext.currentTime is never subtracted
// directly from a MIDI event timestamp elsewhere in the client.
// Loudness of the click, 0 (silent) to 1. The accent on beat one stays
// proportionally louder than the others at every volume.
const ACCENT_GAIN_AT_FULL_VOLUME = 0.7
const NORMAL_GAIN_AT_FULL_VOLUME = 0.5

export function scheduleMetronome(
  tempoBpm: number,
  countInBeats: number,
  scaleBeats: number,
  onBeatChange: (label: string) => void,
  volume = 0.5,
  // One AudioBuffer per count-in beat, or null for clicks only. Scheduled
  // on the same clock as the click so the two stay locked together.
  countInVoice: readonly AudioBuffer[] | null = null
): MetronomeHandle {
  const clamped = Math.min(1, Math.max(0, volume))
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
    const level =
      clamped *
      (accent ? ACCENT_GAIN_AT_FULL_VOLUME : NORMAL_GAIN_AT_FULL_VOLUME)
    // exponentialRampToValueAtTime cannot start from zero, so a silenced
    // click has to be skipped rather than scheduled at gain 0.
    if (level <= 0) return
    gain.gain.setValueAtTime(level, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(when)
    oscillator.stop(when + 0.09)
  }

  const speak = (when: number, buffer: AudioBuffer) => {
    if (clamped <= 0) return
    const source = audio.createBufferSource()
    const gain = audio.createGain()
    source.buffer = buffer
    gain.gain.value = clamped
    source.connect(gain).connect(audio.destination)
    source.start(when)
  }

  // One extra scheduled beat past the final expected note, so the capture
  // window (aligned to this same beat count by the caller) can retain the
  // final note-off. It is deliberately silent: the run is over, and a click
  // there sounds like an extra beat in the bar.
  const totalBeats = countInBeats + scaleBeats + 1
  const tailBeat = totalBeats - 1
  for (let index = 0; index < totalBeats; index += 1) {
    const when = audioTimeAtSample + (index * beatMs) / 1000
    if (index !== tailBeat) click(when, index % 4 === 0)
    const spoken = index < countInBeats ? countInVoice?.[index] : undefined
    if (spoken) speak(when, spoken)
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
