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
  // Practice mode (docs/SPEC.md, v1 "Goal"): a permanent warm-up aid, not
  // test scaffolding. Runs the metronome/capture/timeline exactly as
  // normal, but never calls POST /api/runs. The server's tempo lock is an
  // docs/ARCHITECTURE.md invariant ("a run submitted at any other tempo is
  // rejected") -- this respects it by never submitting an off-tempo run
  // at all, rather than bypassing the check. `exercise.tempoBpm` can
  // freely differ from the server's currentTempoBpm in this mode; nothing
  // is scored or saved.
  skipSubmit?: boolean
  // Click loudness, 0 to 1. Presentation only: the click is a practice aid
  // and nothing about it reaches scoring.
  metronomeVolume?: number
  // Spoken count-in samples, or null/undefined for clicks only.
  countInVoice?: readonly AudioBuffer[] | null
  // Abandons the run: stops capture, silences the metronome and resolves
  // null without submitting. A run cut short is not a run the player
  // attempted, so it must not reach the database and dent a streak.
  signal?: AbortSignal
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
  // The click stays on the beat (docs/SPEC.md), so eight notes at two per beat
  // occupy four scale beats, not eight.
  // Math.ceil because an odd step count at two notes per beat lands the final
  // onset mid-beat: 15 eighths span 7.5 beats, and the loop that schedules
  // clicks and the tail beat only understands whole ones. Rounding up leaves
  // the tail a full beat past the last note, which is what it is for.
  const scaleBeats = Math.ceil(exercise.steps.length / exercise.notesPerBeat)
  const { audio, firstExpectedBeat, beatMs } = scheduleMetronome(
    exercise.tempoBpm,
    countInBeats,
    scaleBeats,
    onBeatChange,
    options.metronomeVolume,
    options.countInVoice
  )
  options.onScheduled?.({
    firstExpectedBeat,
    beatMs,
    noteMs: beatMs / exercise.notesPerBeat
  })
  const capture = startCapture(input, firstExpectedBeat, options.onLiveNote)

  return new Promise((resolve, reject) => {
    let timer = 0
    let settled = false
    const finish = (outcome: RunOutcome | null) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abandon)
      resolve(outcome)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', abandon)
      reject(error)
    }
    const abandon = () => {
      window.clearTimeout(timer)
      capture.stop()
      void audio.close()
      console.info('[MIDI] run stopped before the capture window closed.')
      finish(null)
    }
    if (options.signal?.aborted) {
      abandon()
      return
    }
    options.signal?.addEventListener('abort', abandon, { once: true })

    timer = window.setTimeout(
      () => {
        capture.stop()
        void audio.close()
        if (options.signal?.aborted) {
          finish(null)
          return
        }
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
          finish(null)
          return
        }
        if (options.signal?.aborted) {
          finish(null)
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
        submitRun(payload, options.signal).then(
          (response) => finish({ response, events: capture.events }),
          fail
        )
      },
      // one beat past the final expected note, matching the metronome's
      // scheduled tail beat, so the final note-off is captured
      (countInBeats + scaleBeats + 1) * beatMs
    )
  })
}
