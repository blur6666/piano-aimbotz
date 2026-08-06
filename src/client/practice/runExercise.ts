import type { MidiEvent, SubmitRun } from '../../shared/contracts.js'
import { startCapture } from '../midi/capture.js'
import { readableMidiNote } from '../midi/format.js'
import { scheduleMetronome } from '../metronome/index.js'
import { submitRun, type SubmitRunResponse } from '../api/runs.js'

export type PracticeExercise = {
  id: number
  tempoBpm: number
  // 2 = straight eighths, so eight notes occupy four metronome beats.
  notesPerBeat: number
  steps: Array<{ noteSpelling: string; fingerNumber: number }>
}

export type RunSchedule = {
  // performance.now()-relative timestamp of the first expected note,
  // shared clock with MidiEvent offsets (see capture.ts).
  firstExpectedBeat: number
  beatMs: number
  // Spacing between consecutive expected notes: beatMs / notesPerBeat.
  noteMs: number
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
  // Click loudness, 0 to 1. Presentation only: the click is a practice aid
  // and nothing about it reaches scoring.
  metronomeVolume?: number
}

export type RunOutcome = {
  response: SubmitRunResponse
  // The run's captured events, returned so the caller can name the pitch
  // actually played for each hard fault. The server does not echo events
  // back on submit, and holding them here avoids a follow-up read.
  events: MidiEvent[]
}

// Resolves to the run outcome for a normal (submitted) run, or null for a
// practice run (options.skipSubmit) that was never sent.
export function runExercise(
  input: MIDIInput,
  exercise: PracticeExercise,
  onBeatChange: (label: string) => void,
  options: RunExerciseOptions = {}
): Promise<RunOutcome | null> {
  const countInBeats = 4
  // The click stays on the beat (SPEC.md), so eight notes at two per beat
  // occupy four scale beats, not eight.
  const scaleBeats = exercise.steps.length / exercise.notesPerBeat
  const { audio, firstExpectedBeat, beatMs } = scheduleMetronome(
    exercise.tempoBpm,
    countInBeats,
    scaleBeats,
    onBeatChange,
    options.metronomeVolume
  )
  options.onScheduled?.({
    firstExpectedBeat,
    beatMs,
    noteMs: beatMs / exercise.notesPerBeat
  })
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
        submitRun(payload).then(
          (response) => resolve({ response, events: capture.events }),
          reject
        )
      },
      // one beat past the final expected note, matching the metronome's
      // scheduled tail beat, so the final note-off is captured
      (countInBeats + scaleBeats + 1) * beatMs
    )
  })
}
