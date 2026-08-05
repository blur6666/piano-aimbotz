import type { MidiEvent, SubmitRun } from '../../shared/contracts.js'
import { startCapture } from '../midi/capture.js'
import { readableMidiNote } from '../midi/format.js'
import { scheduleMetronome } from '../metronome/index.js'
import {
  submitRun,
  type AssessmentStep,
  type SubmitRunResponse
} from '../api/runs.js'

export type PracticeExercise = {
  id: number
  tempoBpm: number
  steps: Array<{ noteSpelling: string; fingerNumber: number }>
}

export type RunSchedule = {
  // performance.now()-relative timestamp of the first expected note,
  // shared clock with MidiEvent offsets (see capture.ts).
  firstExpectedBeat: number
  beatMs: number
}

export type RunExerciseOptions = {
  // Fired once, synchronously, as soon as the metronome/capture clock is
  // established -- before the count-in starts -- so a live visualizer can
  // align itself to the same clock capture.ts uses.
  onScheduled?: (schedule: RunSchedule) => void
  // Fired for every normalized MIDI event as it's captured, live. Best
  // effort only: never affects what's recorded or submitted.
  onLiveNote?: (event: MidiEvent) => void
  // Practice mode (BACKLOG.md "unlocked bpm ... for a while when we
  // test"): runs the metronome/capture/timeline exactly as normal, but
  // never calls POST /api/runs. The server's tempo lock is an
  // ARCHITECTURE.md invariant ("a run submitted at any other tempo is
  // rejected") -- this respects it by never submitting an off-tempo run
  // at all, rather than bypassing the check. `exercise.tempoBpm` can
  // freely differ from the server's currentTempoBpm in this mode; nothing
  // is scored or saved.
  skipSubmit?: boolean
}

// Temporary console-only performance report (BACKLOG.md). The real
// scoring/penalty formula is explicitly undecided, so every point value
// below is a loud, unmistakable placeholder rather than an invented
// number that could pass for real -- everything else printed is a real
// figure scoreRun already computes (hit/miss per note, timing deviation,
// hard/timing/overlap fault counts).
const SCORE_PLACEHOLDER = '[PLACEHOLDER -- scoring formula not decided]'

function printRunSummary(
  exerciseSteps: PracticeExercise['steps'],
  assessment: SubmitRunResponse['originalAssessment']
): void {
  const line = '-'.repeat(70)
  console.log(`Summary ${line}`)
  assessment.steps.forEach((step: AssessmentStep, index) => {
    const note = exerciseSteps[index]?.noteSpelling ?? '?'
    const label = `${index + 1}. ${note}`.padEnd(6)
    if (step.missed) {
      console.log(
        `${label} ❌ Miss!  (not played). Penalty: ${SCORE_PLACEHOLDER}`
      )
      return
    }
    const deviationMs =
      step.timingDeviationUs === null ? null : step.timingDeviationUs / 1000
    const deviationLabel =
      deviationMs === null
        ? ''
        : Math.abs(deviationMs) < 5
          ? 'Perfect! (<5ms)'
          : `${deviationMs >= 0 ? '+' : ''}${deviationMs.toFixed(1)}ms from perfect`
    const flags = [
      step.timingExcluded ? '(timing excluded, recovery window)' : '',
      step.hardFaultCount > 0
        ? `⚠ ${step.hardFaultCount} hard fault(s), penalty: ${SCORE_PLACEHOLDER}`
        : ''
    ]
      .filter(Boolean)
      .join(' ')
    console.log(
      `${label} ✅ Hit!  ${deviationLabel} Soft fault value: ${SCORE_PLACEHOLDER} ${flags}`.trimEnd()
    )
  })
  console.log(line)
  const notesHit = assessment.steps.filter((step) => !step.missed).length
  const notesMissed = assessment.steps.length - notesHit
  console.log(`Notes hit:            ${notesHit} / ${assessment.steps.length}`)
  console.log(`Notes missed:         ${notesMissed}`)
  console.log(`Hard faults:          ${assessment.summary.hardFaultCount}`)
  console.log(`Timing faults:        ${assessment.summary.timingFaultCount}`)
  console.log(`Overlap faults:       ${assessment.summary.overlapFaultCount}`)
  console.log(
    `Mean abs deviation:   ${assessment.summary.meanAbsoluteTimingDeviationUs === null ? '—' : `${(assessment.summary.meanAbsoluteTimingDeviationUs / 1000).toFixed(1)}ms`}`
  )
  console.log(`Passed:               ${assessment.summary.passed}`)
  console.log(`Total hard fault penalty: ${SCORE_PLACEHOLDER}`)
  console.log(`Total soft fault penalty: ${SCORE_PLACEHOLDER}`)
  console.log(`Total score:              ${SCORE_PLACEHOLDER}`)
}

// Resolves to the real server response for a normal (submitted) run, or
// null for a practice run (options.skipSubmit) that was never sent.
export function runExercise(
  input: MIDIInput,
  exercise: PracticeExercise,
  onBeatChange: (label: string) => void,
  options: RunExerciseOptions = {}
): Promise<SubmitRunResponse | null> {
  const countInBeats = 4
  const { audio, firstExpectedBeat, beatMs } = scheduleMetronome(
    exercise.tempoBpm,
    countInBeats,
    exercise.steps.length,
    onBeatChange
  )
  options.onScheduled?.({ firstExpectedBeat, beatMs })
  const capture = startCapture(input, firstExpectedBeat, options.onLiveNote)

  return new Promise((resolve, reject) => {
    window.setTimeout(
      () => {
        capture.stop()
        audio.close()
        console.table(
          capture.events.map((event) => ({
            sequence: event.sequenceNumber,
            event: event.type,
            note: readableMidiNote(event.midiPitch),
            offset: `${event.offsetUs >= 0 ? '+' : ''}${(event.offsetUs / 1000).toFixed(1)}ms`,
            timestampUtc: new Date(
              performance.timeOrigin + firstExpectedBeat + event.offsetUs / 1000
            ).toISOString()
          }))
        )
        if (options.skipSubmit) {
          console.log(
            `Practice run at ${exercise.tempoBpm} BPM -- not submitted, no score.`
          )
          resolve(null)
          return
        }
        const payload: SubmitRun = {
          exerciseId: exercise.id,
          firstExpectedBeatAtMs: Math.round(
            performance.timeOrigin + firstExpectedBeat
          ),
          tempoBpm: exercise.tempoBpm,
          events: capture.events
        }
        submitRun(payload).then((response) => {
          printRunSummary(exercise.steps, response.originalAssessment)
          resolve(response)
        }, reject)
      },
      // one beat past the eighth expected note, matching the metronome's
      // scheduled tail beat, so the final note-off is captured
      (countInBeats + exercise.steps.length + 1) * beatMs
    )
  })
}
