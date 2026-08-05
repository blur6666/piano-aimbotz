import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { fetchExercises, type ExerciseSummary } from './api/exercises.js'
import { requestMidiInputs } from './midi/access.js'
import { runExercise } from './practice/runExercise.js'

function App() {
  const [exercise, setExercise] = useState<ExerciseSummary | null>(null)
  const [inputs, setInputs] = useState<MIDIInput[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [status, setStatus] = useState('Choose a MIDI input to begin.')
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState<string | null>(null)
  const [faults, setFaults] = useState<number | null>(null)
  const inputsRef = useRef<MIDIInput[]>([])

  useEffect(() => {
    fetchExercises()
      .then((exercises) => setExercise(exercises[0]))
      .catch((error: Error) => setStatus(error.message))
  }, [])

  async function chooseMidi() {
    try {
      const available = await requestMidiInputs()
      inputsRef.current = available
      setInputs(available)
      if (available.length > 0) {
        setSelectedInput(available[0].id)
        setStatus('Input ready. Press Start when you are ready.')
        console.info(
          `[MIDI] connected: ${available[0].name ?? available[0].id}`
        )
      } else setStatus('No MIDI inputs found.')
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'MIDI permission was denied or the device is unavailable.'
      )
    }
  }

  async function startRun() {
    if (!exercise || !selectedInput) return
    const input = inputsRef.current.find(
      (candidate) => candidate.id === selectedInput
    )
    if (!input) return
    setFaults(null)
    setRunning(true)
    setStatus('Count-in')
    console.info(
      `[MIDI] run started: ${exercise.name} at ${exercise.currentTempoBpm} BPM`
    )
    try {
      const result = await runExercise(
        input,
        {
          id: exercise.id,
          tempoBpm: exercise.currentTempoBpm,
          steps: exercise.steps
        },
        setBeat
      )
      setRunning(false)
      const hardFaultCount = result.originalAssessment.summary.hardFaultCount
      setFaults(hardFaultCount)
      setStatus(
        `Run saved. ${hardFaultCount} wrong notes. Tempo ${result.progress.currentTempoBpm} BPM, streak ${result.progress.consecutiveCleanRuns}/3.`
      )
      setExercise({
        ...exercise,
        currentTempoBpm: result.progress.currentTempoBpm,
        consecutiveCleanRuns: result.progress.consecutiveCleanRuns
      })
      console.info(
        `[MIDI] run saved: ${hardFaultCount} wrong notes, passed=${result.originalAssessment.summary.passed}`
      )
    } catch (error) {
      setRunning(false)
      setStatus(
        error instanceof Error ? error.message : 'Could not save the run.'
      )
    }
  }

  return (
    <main>
      <header>
        <p className="eyebrow">PRACTICE / STAGE 2</p>
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
        {running && beat !== null && <div className="count">{beat}</div>}
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
