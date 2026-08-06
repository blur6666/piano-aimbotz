// Spoken count-in ("one, two, three, four") layered over the click.
//
// These are decoded into AudioBuffers and scheduled on the same Web Audio
// clock as the click, so they are sample-accurate rather than fired off a
// setTimeout. That matters: this app measures the player against a beat
// grid to within tens of milliseconds, and a count-in that wobbles by
// 100ms would be a worse reference than no count-in at all. speechSynthesis
// was rejected for exactly that reason.
//
// The click remains the authoritative grid. The voice is orientation only,
// and its absence is not an error -- if the files are missing the run
// proceeds with clicks alone.
const COUNT_IN_SAMPLE_URLS = [
  '/count-in/1.mp3',
  '/count-in/2.mp3',
  '/count-in/3.mp3',
  '/count-in/4.mp3'
]

export type CountInVoice = readonly AudioBuffer[]

// AudioBuffers hold plain PCM and are not bound to the context that
// decoded them, so one decode at page load serves every later run rather
// than re-fetching per run.
let cached: Promise<CountInVoice | null> | null = null

async function decodeAll(): Promise<CountInVoice | null> {
  let audio: AudioContext | null = null
  try {
    audio = new AudioContext()
    const buffers = await Promise.all(
      COUNT_IN_SAMPLE_URLS.map(async (url) => {
        const response = await fetch(url)
        // A dev server that serves index.html for unknown paths would
        // otherwise hand us HTML and fail deeper inside decodeAudioData.
        if (!response.ok) throw new Error(`${url}: ${response.status}`)
        return audio!.decodeAudioData(await response.arrayBuffer())
      })
    )
    return buffers
  } catch (error) {
    console.info(
      `[count-in] no spoken count-in (${error instanceof Error ? error.message : 'unavailable'}); clicks only. ` +
        'Add 1.mp3-4.mp3 under public/count-in/ to enable it.'
    )
    return null
  } finally {
    void audio?.close()
  }
}

// Memoized: resolves to null, once, when the samples are absent. Callers
// treat null as "clicks only" rather than as a failure.
export function loadCountInVoice(): Promise<CountInVoice | null> {
  cached ??= decodeAll()
  return cached
}
