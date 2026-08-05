import type { SubmitRun } from '../../shared/contracts.js'
import { startCapture } from '../midi/capture.js'
import { readableMidiNote } from '../midi/format.js'
import { scheduleMetronome } from '../metronome/index.js'
import { submitRun, type SubmitRunResponse } from '../api/runs.js'

export type PracticeExercise = {
  id: number
  tempoBpm: number
  steps: Array<{ noteSpelling: string; fingerNumber: number }>
}

export function runExercise(
  input: MIDIInput,
  exercise: PracticeExercise,
  onBeatChange: (label: string) => void
): Promise<SubmitRunResponse> {
  const countInBeats = 4
  const { audio, firstExpectedBeat, beatMs } = scheduleMetronome(
    exercise.tempoBpm,
    countInBeats,
    exercise.steps.length,
    onBeatChange
  )
  const capture = startCapture(input, firstExpectedBeat)

  return new Promise((resolve, reject) => {
    window.setTimeout(
      () => {
        capture.stop()
        audio.close()
        const payload: SubmitRun = {
          exerciseId: exercise.id,
          firstExpectedBeatAtMs: Math.round(
            performance.timeOrigin + firstExpectedBeat
          ),
          tempoBpm: exercise.tempoBpm,
          events: capture.events
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
        submitRun(payload).then(resolve, reject)
      },
      // one beat past the eighth expected note, matching the metronome's
      // scheduled tail beat, so the final note-off is captured
      (countInBeats + exercise.steps.length + 1) * beatMs
    )
  })
}
