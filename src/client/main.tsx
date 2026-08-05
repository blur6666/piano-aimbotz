import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { fetchExercises, type SelectableExercise } from './api/exercises.js'
import {
  fetchRunDetail,
  fetchRunHistory,
  type RunDetail,
  type RunHistoryEntry
} from './api/runs.js'
import { requestMidiInputs } from './midi/access.js'
import { runExercise } from './practice/runExercise.js'

function formatDeviation(deviationUs: number | null): string {
  if (deviationUs === null) return '—'
  return `${(deviationUs / 1000).toFixed(1)} ms`
}

function App() {
  const [exercises, setExercises] = useState<SelectableExercise[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    null
  )
  const [inputs, setInputs] = useState<MIDIInput[]>([])
  const [selectedInput, setSelectedInput] = useState('')
  const [status, setStatus] = useState('Choose a MIDI input to begin.')
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState<string | null>(null)
  const [faults, setFaults] = useState<number | null>(null)
  const [history, setHistory] = useState<RunHistoryEntry[]>([])
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null)
  const inputsRef = useRef<MIDIInput[]>([])

  const exercise =
    exercises.find((candidate) => candidate.id === selectedExerciseId) ?? null

  const loadHistory = useCallback((exerciseId: number) => {
    fetchRunHistory(exerciseId)
      .then((runs) => setHistory(runs))
      .catch((error: Error) => {
        setHistory([])
        console.warn(`[history] could not load runs: ${error.message}`)
      })
  }, [])

  useEffect(() => {
    fetchExercises()
      .then((loaded) => {
        setExercises(loaded)
        if (loaded.length > 0) setSelectedExerciseId(loaded[0].id)
      })
      .catch((error: Error) => setStatus(error.message))
  }, [])

  useEffect(() => {
    setRunDetail(null)
    if (selectedExerciseId === null) {
      setHistory([])
      return
    }
    loadHistory(selectedExerciseId)
  }, [selectedExerciseId, loadHistory])

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

  async function openRunDetail(runId: number) {
    try {
      setRunDetail(await fetchRunDetail(runId))
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Could not load the run.'
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
      `[MIDI] run started: ${exercise.label} at ${exercise.currentTempoBpm} BPM`
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
      setExercises((current) =>
        current.map((candidate) =>
          candidate.id === exercise.id
            ? {
                ...candidate,
                currentTempoBpm: result.progress.currentTempoBpm,
                consecutiveCleanRuns: result.progress.consecutiveCleanRuns
              }
            : candidate
        )
      )
      loadHistory(exercise.id)
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
        <h1>{exercise ? exercise.label : 'No exercise seeded'}</h1>
        <p className="intro">
          Eight notes. One steady click. Raw performance captured as you play.
        </p>
      </header>
      <section className="panel">
        <div className="toolbar">
          <select
            value={selectedExerciseId ?? ''}
            onChange={(event) =>
              setSelectedExerciseId(Number(event.target.value))
            }
            disabled={running || exercises.length === 0}
          >
            {exercises.length === 0 ? (
              <option value="">No exercise seeded</option>
            ) : (
              exercises.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label} — {candidate.currentTempoBpm} BPM, streak{' '}
                  {candidate.consecutiveCleanRuns}/3
                </option>
              ))
            )}
          </select>
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
      <section className="panel history">
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="intro">No runs recorded for this exercise yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Tempo</th>
                <th>Hard</th>
                <th>Timing</th>
                <th>Overlap</th>
                <th>Mean deviation</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => openRunDetail(entry.id)}
                  className={runDetail?.run.id === entry.id ? 'open' : ''}
                >
                  <td>
                    {new Date(entry.firstExpectedBeatAtMs).toLocaleString()}
                  </td>
                  <td>{entry.tempoBpm} BPM</td>
                  <td>{entry.originalAssessment.hardFaultCount}</td>
                  <td>{entry.originalAssessment.timingFaultCount}</td>
                  <td>{entry.originalAssessment.overlapFaultCount}</td>
                  <td>
                    {formatDeviation(
                      entry.originalAssessment.meanAbsoluteTimingDeviationUs
                    )}
                  </td>
                  <td>
                    {entry.originalAssessment.passed ? 'passed' : 'failed'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {runDetail && (
          <div className="run-detail">
            <h3>
              Run {runDetail.run.id} — scored now with{' '}
              {runDetail.currentAssessment.algorithmVersion}
            </h3>
            <p className="intro">
              Failed-run behavior applied to this run:{' '}
              {
                runDetail.originalAssessment.progressionParameters
                  .failedRunBehavior
              }
              {runDetail.originalAssessment.progressionParameters
                .failedRunBehavior === 'step_down'
                ? ` (−${runDetail.originalAssessment.progressionParameters.tempoDecrementBpm} BPM, minimum ${runDetail.originalAssessment.progressionParameters.minimumTempoBpm} BPM)`
                : ''}
            </p>
            <p className="intro">
              Failed-run behavior for this run:{' '}
              {
                runDetail.originalAssessment.progressionParameters
                  .failedRunBehavior
              }
              {runDetail.originalAssessment.progressionParameters
                .failedRunBehavior === 'step_down'
                ? ` (−${runDetail.originalAssessment.progressionParameters.tempoDecrementBpm} BPM, minimum ${runDetail.originalAssessment.progressionParameters.minimumTempoBpm} BPM)`
                : ''}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Expected pitch</th>
                  <th>Matched</th>
                  <th>Deviation</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {runDetail.currentAssessment.steps.map((step) => {
                  const flags = [
                    step.missed ? 'missed' : '',
                    step.hardFaultCount > 0
                      ? `${step.hardFaultCount} hard`
                      : '',
                    step.timingFault ? 'timing' : '',
                    step.timingExcluded ? 'excluded' : '',
                    step.overlapFault ? 'overlap' : ''
                  ].filter((flag) => flag !== '')
                  return (
                    <tr key={step.stepIndex}>
                      <td>{step.stepIndex}</td>
                      <td>{step.expectedMidiPitch ?? '—'}</td>
                      <td>{step.matchedEventSequenceNumber ?? '—'}</td>
                      <td>{formatDeviation(step.timingDeviationUs)}</td>
                      <td>{flags.length > 0 ? flags.join(', ') : 'clean'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {runDetail.currentAssessment.faults.length > 0 && (
              <p className="intro">
                Faults:{' '}
                {runDetail.currentAssessment.faults
                  .map((fault) => `${fault.type} at step ${fault.stepIndex}`)
                  .join('; ')}
              </p>
            )}
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
