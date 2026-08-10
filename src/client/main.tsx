import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { fetchExercises, type SelectableExercise } from './api/exercises.js'
import {
  fetchRunDetail,
  fetchRunHistory,
  type AssessmentStep,
  type RunDetail,
  type RunHistoryEntry
} from './api/runs.js'
import {
  loadCountInVoice,
  type CountInVoice
} from './metronome/countInVoice.js'
import { requestMidiInputs } from './midi/access.js'
import { createKeyboardInput } from './midi/keyboardInput.js'
import {
  runExercise,
  type RunOutcome,
  type RunSchedule
} from './practice/runExercise.js'
import { RunResult } from './practice/RunResult.js'
import { Timeline, type LiveNote } from './practice/Timeline.js'
import { Keyboard } from './practice/Keyboard.js'
import { keyboardOctaveCount, resolveScaleKeys } from './practice/noteNames.js'

function formatDeviation(deviationUs: number | null): string {
  if (deviationUs === null) return '—'
  return `${(deviationUs / 1000).toFixed(1)} ms`
}

// Scope trimmed to the 5 easiest scales for now (BACKLOG.md); the rest
// of the seeded catalog is unaffected, just hidden from this dropdown.
const VISIBLE_SCALE_SLUGS = new Set([
  'c-major',
  'f-major',
  'g-major',
  'd-major',
  'e-major',
  'b-major'
])

// Remembers the selected MIDI input across reloads (BACKLOG.md). Once a
// browser has granted Web MIDI permission to this origin, later
// requestMIDIAccess() calls resolve without re-prompting, so the effect
// below can silently reconnect on mount rather than waiting for a click.
const MIDI_INPUT_STORAGE_KEY = 'piano-aimbotz:selectedMidiInputId'

// Selectable alongside real MIDI inputs (BACKLOG.md): lets anyone without
// hardware still play a run via src/client/midi/keyboardInput.ts.
const COMPUTER_KEYBOARD_INPUT_ID = '__computer-keyboard__'

const METRONOME_VOLUME_STORAGE_KEY = 'piano-aimbotz:metronomeVolume'
const DEFAULT_METRONOME_VOLUME = 0.5

function App() {
  const [exercises, setExercises] = useState<SelectableExercise[]>([])
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    null
  )
  const [inputs, setInputs] = useState<MIDIInput[]>([])
  const [selectedRealInputId, setSelectedRealInputId] = useState('')
  const [useComputerKeyboard, setUseComputerKeyboard] = useState(false)
  const [status, setStatus] = useState('')
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<RunOutcome | null>(null)
  const [history, setHistory] = useState<RunHistoryEntry[]>([])
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null)
  const [runSchedule, setRunSchedule] = useState<RunSchedule | null>(null)
  const [liveNotes, setLiveNotes] = useState<LiveNote[]>([])
  const [finalSteps, setFinalSteps] = useState<AssessmentStep[] | null>(null)
  const [showKeyboardDuringTest, setShowKeyboardDuringTest] = useState(true)
  const [practiceMode, setPracticeMode] = useState(false)
  const [practiceTempoBpm, setPracticeTempoBpm] = useState(80)
  const [metronomeVolume, setMetronomeVolume] = useState(() => {
    // Number(null) is 0, so an absent key has to be rejected before the
    // range check or a first visit silently starts with no click at all.
    const raw = localStorage.getItem(METRONOME_VOLUME_STORAGE_KEY)
    if (raw === null) return DEFAULT_METRONOME_VOLUME
    const saved = Number(raw)
    return Number.isFinite(saved) && saved >= 0 && saved <= 1
      ? saved
      : DEFAULT_METRONOME_VOLUME
  })
  const [looping, setLooping] = useState(false)
  const inputsRef = useRef<MIDIInput[]>([])
  const countInVoiceRef = useRef<CountInVoice | null>(null)
  // Aborts the run in flight. Also the "should the loop keep going" flag:
  // stopping mid-run must not immediately start the next one.
  const abortRef = useRef<AbortController | null>(null)
  const loopingRef = useRef(false)
  // startRun is re-created every render, so the key handler reads it
  // through a ref rather than capturing a stale closure.
  const startRunRef = useRef<() => void>(() => {})

  const exercise =
    exercises.find((candidate) => candidate.id === selectedExerciseId) ?? null
  const keyboardOctaves = exercise
    ? keyboardOctaveCount(exercise.octaves)
    : null
  const visibleExercises = exercises.filter(
    (candidate) =>
      VISIBLE_SCALE_SLUGS.has(candidate.scaleSlug) &&
      candidate.direction === 'ascending'
  )
  const activeInputId = useComputerKeyboard
    ? COMPUTER_KEYBOARD_INPUT_ID
    : selectedRealInputId

  const loadHistory = useCallback((exerciseId: number) => {
    fetchRunHistory(exerciseId)
      .then((runs) => setHistory(runs))
      .catch((error: Error) => {
        setHistory([])
        console.warn(`[history] could not load runs: ${error.message}`)
        // TODO: raise toast
      })
  }, [])

  useEffect(() => {
    fetchExercises()
      .then((loaded) => {
        setExercises(loaded)
        const visible = loaded.filter(
          (candidate) =>
            VISIBLE_SCALE_SLUGS.has(candidate.scaleSlug) &&
            candidate.direction === 'ascending'
        )
        if (visible.length > 0) setSelectedExerciseId(visible[0].id)
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

  const applyAvailableInputs = useCallback((available: MIDIInput[]) => {
    inputsRef.current = available
    setInputs(available)
    if (available.length === 0) {
      setStatus('No MIDI inputs found.')
      return
    }
    const savedId = localStorage.getItem(MIDI_INPUT_STORAGE_KEY)
    const restored = available.find((input) => input.id === savedId)
    const chosen = restored ?? available[0]
    setSelectedRealInputId(chosen.id)
    setStatus(
      restored
        ? 'Input reconnected. Press Start when you are ready.'
        : 'Input ready. Press Start when you are ready.'
    )
    console.info(`[MIDI] connected: ${chosen.name ?? chosen.id}`)
  }, [])

  // Best-effort silent reconnect: if this origin already has Web MIDI
  // permission from a previous visit, this resolves without prompting. If
  // it fails (first visit, denied, unsupported), stay quiet -- selecting
  // the MIDI dropdown is the explicit first-time path and does surface
  // errors.
  useEffect(() => {
    requestMidiInputs()
      .then(applyAvailableInputs)
      .catch(() => {})
  }, [applyAvailableInputs])

  useEffect(() => {
    if (selectedRealInputId)
      localStorage.setItem(MIDI_INPUT_STORAGE_KEY, selectedRealInputId)
  }, [selectedRealInputId])

  useEffect(() => {
    localStorage.setItem(METRONOME_VOLUME_STORAGE_KEY, String(metronomeVolume))
  }, [metronomeVolume])

  // Decoded once, ahead of the first run: decoding inside scheduleMetronome
  // would race the first count-in beat. Absent samples are not an error.
  useEffect(() => {
    void loadCountInVoice().then((voice) => {
      countInVoiceRef.current = voice
    })
  }, [])

  useEffect(() => {
    loopingRef.current = looping
  }, [looping])

  // Space starts a run, or stops the one in flight. Deliberately not a
  // letter: A-K and W/E/T/Y/U are piano keys in computer-keyboard mode.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.code !== 'Space' && event.key !== ' ') return
      const target = event.target as HTMLElement | null
      // Space on a focused button or checkbox already means "activate it".
      if (target && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
        return
      event.preventDefault()
      if (abortRef.current) stopRun()
      else startRunRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function stopRun() {
    // Clear the loop flag first: the abort resolves the run as null, and
    // the loop must not treat that as "finished, go again".
    loopingRef.current = false
    setLooping(false)
    abortRef.current?.abort()
  }

  async function refreshMidiInputs() {
    try {
      applyAvailableInputs(await requestMidiInputs())
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'MIDI permission was denied or the device is unavailable.'
      )
    }
  }

  function toggleComputerKeyboard(enabled: boolean) {
    setUseComputerKeyboard(enabled)
    setStatus(
      enabled
        ? 'Using computer keyboard. Press Start when you are ready.'
        : selectedRealInputId
          ? 'Input ready. Press Start when you are ready.'
          : 'No MIDI inputs found.'
    )
  }

  function handleMidiSelectChange(selectedId: string) {
    setSelectedRealInputId(selectedId)
    if (!selectedId) {
      setStatus('No MIDI inputs found.')
      return
    }
    const selected = inputsRef.current.find((input) => input.id === selectedId)
    setStatus(
      `Input ready: ${selected?.name ?? selectedId}. Press Start when you are ready.`
    )
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

  function togglePracticeMode(enabled: boolean) {
    setPracticeMode(enabled)
    if (enabled && exercise) setPracticeTempoBpm(exercise.currentTempoBpm)
  }

  async function startRun() {
    if (!exercise || !activeInputId || abortRef.current) return
    let input: MIDIInput
    let disposeKeyboardInput: (() => void) | null = null
    if (useComputerKeyboard) {
      const keyboard = createKeyboardInput()
      input = keyboard.input as unknown as MIDIInput
      disposeKeyboardInput = keyboard.dispose
    } else {
      const found = inputsRef.current.find(
        (candidate) => candidate.id === activeInputId
      )
      if (!found) return
      input = found
    }
    const tempoBpm = practiceMode ? practiceTempoBpm : exercise.currentTempoBpm
    const controller = new AbortController()
    abortRef.current = controller
    setOutcome(null)
    setRunning(true)
    setStatus(practiceMode ? 'Count-in (practice, not saved)' : 'Count-in')
    setRunSchedule(null)
    setLiveNotes([])
    setFinalSteps(null)
    console.info(
      `[MIDI] run started: ${exercise.label} at ${tempoBpm} BPM${practiceMode ? ' (practice mode)' : ''}`
    )
    try {
      const result = await runExercise(
        input,
        {
          id: exercise.id,
          tempoBpm,
          notesPerBeat: exercise.notesPerBeat,
          steps: exercise.steps
        },
        setBeat,
        {
          metronomeVolume,
          countInVoice: countInVoiceRef.current,
          signal: controller.signal,
          onScheduled: setRunSchedule,
          onLiveNote: (event) => {
            if (event.type !== 'note_on') return
            setLiveNotes((current) => [
              ...current,
              { midiPitch: event.midiPitch, offsetUs: event.offsetUs }
            ])
          },
          skipSubmit: practiceMode
        }
      )
      setRunning(false)
      if (controller.signal.aborted) {
        setStatus('Stopped. Press Space to start again.')
        return
      }
      if (result === null) {
        setStatus(`Practice run complete at ${tempoBpm} BPM. Not saved.`)
        return
      }
      const { originalAssessment, progress } = result.response
      setFinalSteps(originalAssessment.steps)
      setOutcome(result)
      setStatus(
        `Run saved. Tempo ${progress.currentTempoBpm} BPM, streak ${progress.consecutiveCleanRuns}/3.`
      )
      setExercises((current) =>
        current.map((candidate) =>
          candidate.id === exercise.id
            ? {
                ...candidate,
                currentTempoBpm: progress.currentTempoBpm,
                consecutiveCleanRuns: progress.consecutiveCleanRuns
              }
            : candidate
        )
      )
      loadHistory(exercise.id)
      console.info(
        `[MIDI] run saved: ${originalAssessment.summary.hardFaultCount} wrong notes, passed=${originalAssessment.summary.passed}`
      )
    } catch (error) {
      setRunning(false)
      setStatus(
        error instanceof Error ? error.message : 'Could not save the run.'
      )
    } finally {
      disposeKeyboardInput?.()
      abortRef.current = null
      // Auto-restart runs until you stop it, pass or fail -- chaining is
      // about staying in the loop, not about being rewarded for a streak.
      // One beat of gap so the last note-off and the next count-in do not
      // run together.
      if (loopingRef.current && !controller.signal.aborted)
        window.setTimeout(() => {
          // Re-checked on arrival, not just when scheduled: stopping during
          // the gap between runs leaves this timer already queued, and it
          // would otherwise start a run the player just cancelled.
          if (loopingRef.current) startRunRef.current()
        }, 60_000 / tempoBpm)
    }
  }

  startRunRef.current = () => void startRun()

  return (
    <main>
      <header>
        <h1>Scales Trainer</h1>
      </header>
      <section className="panel setup">
        <div className="toolbar">
          <select
            value={selectedRealInputId}
            onFocus={refreshMidiInputs}
            onChange={(event) => handleMidiSelectChange(event.target.value)}
            disabled={running || useComputerKeyboard}
          >
            {inputs.length === 0 && (
              <option value="">No MIDI input connected</option>
            )}
            {inputs.map((input) => (
              <option key={input.id} value={input.id}>
                {input.name ?? input.id}
              </option>
            ))}
          </select>
          <p className="status" aria-live="polite">
            {status}
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="toolbar">
          <select
            id="scaleSelector"
            value={selectedExerciseId ?? ''}
            onChange={(event) =>
              setSelectedExerciseId(Number(event.target.value))
            }
            disabled={running || visibleExercises.length === 0}
          >
            {visibleExercises.length === 0 ? (
              <option value="">No exercise seeded</option>
            ) : (
              visibleExercises.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))
            )}
          </select>
          {running ? (
            <button onClick={stopRun}>Stop</button>
          ) : (
            <button
              className="primary"
              onClick={startRun}
              disabled={!activeInputId || !exercise}
            >
              Start run
            </button>
          )}
          <label className="keyboard-toggle">
            <input
              type="checkbox"
              checked={looping}
              onChange={(event) => setLooping(event.target.checked)}
            />
            Auto-restart
          </label>
          <label className="volume">
            <span>Click</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={metronomeVolume}
              disabled={running}
              onChange={(event) =>
                setMetronomeVolume(Number(event.target.value))
              }
            />
          </label>
          <div className="stats-row">
            <div className="stat">
              <strong>{exercise?.currentTempoBpm ?? '—'}</strong>
              <span>Current max BPM</span>
            </div>
            <div className="stat">
              <strong>{exercise?.consecutiveCleanRuns ?? 0}/3</strong>
              <span>Streak</span>
            </div>
          </div>
        </div>
        {running && beat !== null && <div className="count">{beat}</div>}
        {exercise && (running || finalSteps !== null) && (
          <Timeline
            steps={exercise.steps}
            noteMs={
              runSchedule?.noteMs ??
              60_000 /
                ((practiceMode ? practiceTempoBpm : exercise.currentTempoBpm) *
                  exercise.notesPerBeat)
            }
            running={running}
            firstExpectedBeat={runSchedule?.firstExpectedBeat ?? null}
            liveNotes={liveNotes}
            finalSteps={finalSteps}
          />
        )}
        {exercise &&
          keyboardOctaves !== null &&
          (!running || showKeyboardDuringTest) && (
            <Keyboard
              scaleKeys={resolveScaleKeys(
                exercise.steps,
                exercise.direction,
                keyboardOctaves
              )}
              octaves={keyboardOctaves}
            />
          )}
        {exercise && outcome && !running && (
          <RunResult
            exerciseSteps={exercise.steps}
            assessmentSteps={outcome.response.originalAssessment.steps}
            faults={outcome.response.originalAssessment.faults}
            events={outcome.events}
            tempoBpm={outcome.response.run.tempoBpm}
            notesPerBeat={exercise.notesPerBeat}
            timingToleranceUs={
              outcome.response.originalAssessment.timingToleranceUs
            }
            maxTimingFaultsPerRun={
              outcome.response.originalAssessment.scoringParameters
                .maxTimingFaultsPerRun
            }
            hardFaultCount={
              outcome.response.originalAssessment.summary.hardFaultCount
            }
            timingFaultCount={
              outcome.response.originalAssessment.summary.timingFaultCount
            }
            timingStartOffsetUs={
              outcome.response.originalAssessment.summary.timingStartOffsetUs
            }
            passed={outcome.response.originalAssessment.summary.passed}
          />
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
                <th>Mean unevenness</th>
                <th>Start offset</th>
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
                    {formatDeviation(
                      entry.originalAssessment.timingStartOffsetUs
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
      <section className="panel dev-tools">
        <h2>Dev tools</h2>
        <div className="dev-tools-row">
          <label className="keyboard-toggle">
            <input
              type="checkbox"
              checked={useComputerKeyboard}
              disabled={running}
              onChange={(event) => toggleComputerKeyboard(event.target.checked)}
            />
            Use computer keyboard as input
          </label>
          <label className="keyboard-toggle">
            <input
              type="checkbox"
              checked={showKeyboardDuringTest}
              onChange={(event) =>
                setShowKeyboardDuringTest(event.target.checked)
              }
            />
            Show keyboard during test
          </label>
          <label className="keyboard-toggle">
            <input
              type="checkbox"
              checked={practiceMode}
              disabled={running}
              onChange={(event) => togglePracticeMode(event.target.checked)}
            />
            Unlocked BPM (testing)
          </label>
          {practiceMode && (
            <input
              type="number"
              min={20}
              max={300}
              value={practiceTempoBpm}
              disabled={running}
              onChange={(event) =>
                setPracticeTempoBpm(Number(event.target.value))
              }
            />
          )}
        </div>
        {useComputerKeyboard && (
          <p className="dev-tools-note">
            W E T Y U = black keys (A S D ... K) row = white keys from C3 to C4
            keys, on the row above.
          </p>
        )}
        {practiceMode && (
          <p className="dev-tools-note">
            Practice mode: runs at the tempo above without saving progress or
            history. The server's tempo lock (docs/ARCHITECTURE.md) is never
            bypassed -- practice runs simply aren't submitted.
          </p>
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
