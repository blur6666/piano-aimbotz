import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { MidiEvent, SubmitRun } from '../shared/contracts.js'
import './styles.css'

type Exercise = {
  id: number
  name: string
  tempoBpm: number
  steps: Array<{ noteSpelling: string; fingerNumber: number }>
}
type MidiInput = MIDIInput
type MidiAccess = MIDIAccess

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

function readableMidiNote(pitch: number): string {
  return `${noteNames[pitch % 12]}${Math.floor(pitch / 12) - 1} (${pitch})`
}

function App() {
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [inputs, setInputs] = useState<MidiInput[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [status, setStatus] = useState('Choose a MIDI input to begin.')
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState<number | null>(null)
  const [faults, setFaults] = useState<number | null>(null)
  const access = useRef<MidiAccess | null>(null)

  useEffect(() => {
    fetch('/api/exercises')
      .then(async (response) => {
        if (!response.ok) throw new Error('The exercise catalog is not seeded.')
        const data = (await response.json()) as { exercises: Exercise[] }
        setExercise(data.exercises[0])
      })
      .catch((error: Error) => setStatus(error.message))
  }, [])

  async function chooseMidi() {
    if (!navigator.requestMIDIAccess)
      return setStatus(
        'Web MIDI is unavailable. Use desktop Chrome or Edge over localhost/HTTPS.'
      )
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: false })
      access.current = midi
      const available = [...midi.inputs.values()]
      setInputs(available)
      if (available.length > 0) {
        setSelectedInput(available[0].id)
        setStatus('Input ready. Press Start when you are ready.')
        console.info(
          `[MIDI] connected: ${available[0].name ?? available[0].id}`
        )
      } else setStatus('No MIDI inputs found.')
    } catch {
      setStatus('MIDI permission was denied or the device is unavailable.')
    }
  }

  async function startRun() {
    if (!exercise || !selectedInput) return
    const input = inputs.find((candidate) => candidate.id === selectedInput)
    if (!input) return
    const events: MidiEvent[] = []
    const beatMs = 60_000 / exercise.tempoBpm
    const countInBeats = 4
    const firstExpectedBeat = performance.now() + countInBeats * beatMs
    let sequence = 0
    const audio = new AudioContext()
    const click = (when: number, accent: boolean) => {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.frequency.value = accent ? 880 : 660
      gain.gain.setValueAtTime(0.12, when)
      gain.gain.exponentialRampToValueAtTime(0.001, when + 0.08)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(when)
      oscillator.stop(when + 0.09)
    }
    input.onmidimessage = (message) => {
      if (!message.data) return
      const [statusByte, pitch, velocity] = Array.from(message.data)
      const command = statusByte & 0xf0
      if (command !== 0x90 && command !== 0x80) return
      const type = command === 0x90 && velocity !== 0 ? 'note_on' : 'note_off'
      const offsetUs = Math.round(
        (message.timeStamp - firstExpectedBeat) * 1000
      )
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
    setFaults(null)
    setRunning(true)
    setStatus('Count-in')
    console.info(
      `[MIDI] run started: ${exercise.name} at ${exercise.tempoBpm} BPM`
    )
    for (
      let index = 0;
      index < countInBeats + exercise.steps.length + 1;
      index += 1
    ) {
      const when = audio.currentTime + (index * beatMs) / 1000
      click(when, index % 4 === 0)
      window.setTimeout(
        () =>
          setBeat(index < countInBeats ? index + 1 : index - countInBeats + 1),
        index * beatMs
      )
    }
    window.setTimeout(
      async () => {
        input.onmidimessage = null
        audio.close()
        setRunning(false)
        setStatus('Saving run...')
        const payload: SubmitRun = {
          exerciseId: exercise.id,
          firstExpectedBeatAtMs: Math.round(
            performance.timeOrigin + firstExpectedBeat
          ),
          tempoBpm: exercise.tempoBpm,
          events
        }
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        })
        const data = (await response.json()) as {
          hardFaultCount?: number
          error?: { message: string }
        }
        if (!response.ok)
          return setStatus(data.error?.message ?? 'Could not save the run.')
        setFaults(data.hardFaultCount ?? 0)
        setStatus(`Run saved. ${data.hardFaultCount ?? 0} wrong notes.`)
        console.info(
          `[MIDI] run saved: ${data.hardFaultCount ?? 0} wrong notes, ${events.length} raw events`
        )
      },
      (countInBeats + exercise.steps.length) * beatMs
    )
  }

  return (
    <main>
      <header>
        <p className="eyebrow">PRACTICE / STAGE 1</p>
        <h1>C major, ascending</h1>
        <p className="intro">
          Eight notes. One steady click. Raw performance captured as you play.
        </p>
      </header>
      <section className="panel">
        <div className="toolbar">
          <button onClick={chooseMidi} disabled={running}>
            Connect MIDI
          </button>
          <select
            value={selectedInput}
            onChange={(event) => setSelectedInput(event.target.value)}
            disabled={running || inputs.length === 0}
          >
            {inputs.length === 0 ? (
              <option value="">No input selected</option>
            ) : (
              inputs.map((input) => (
                <option key={input.id} value={input.id}>
                  {input.name ?? input.id}
                </option>
              ))
            )}
          </select>
          <button
            className="primary"
            onClick={startRun}
            disabled={running || !selectedInput || !exercise}
          >
            Start run
          </button>
        </div>
        <p className="status" aria-live="polite">
          {status}
        </p>
        {running && (
          <div className="count">
            {beat !== null &&
              (beat <= 4 ? `Count-in ${beat}/4` : `Beat ${beat - 4}/8`)}
          </div>
        )}
        <div className="notes">
          {exercise?.steps.map((step, index) => (
            <div className="note" key={index}>
              <strong>{step.noteSpelling}</strong>
              <span>{step.fingerNumber}</span>
            </div>
          ))}
        </div>
        {faults !== null && (
          <div className="result">
            <span>{faults}</span>
            <div>
              <strong>wrong notes</strong>
              <small>Raw MIDI events saved for this run.</small>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
