import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startCapture } from '../src/client/midi/capture.js'
import { runExercise } from '../src/client/practice/runExercise.js'
import type { SubmitRunResponse } from '../src/client/api/runs.js'

function fakeInput(): MIDIInput {
  return { onmidimessage: null } as unknown as MIDIInput
}

function message(timeStamp: number, ...data: number[]): MIDIMessageEvent {
  return {
    data: Uint8Array.from(data),
    timeStamp
  } as unknown as MIDIMessageEvent
}

// Deliver through the input the way the browser does, so a detached handler
// (after stop()) silently drops the message instead of throwing.
function dispatch(input: MIDIInput, event: MIDIMessageEvent): void {
  input.onmidimessage?.(event)
}

describe('startCapture', () => {
  it('normalizes note-on with velocity zero into note_off', () => {
    const input = fakeInput()
    const capture = startCapture(input, 0)
    input.onmidimessage!(message(10, 0x90, 60, 0))
    expect(capture.events).toEqual([
      {
        sequenceNumber: 0,
        offsetUs: 10_000,
        type: 'note_off',
        midiPitch: 60,
        velocity: 0
      }
    ])
  })

  it('keeps real note-ons and explicit note-offs in the two-event vocabulary', () => {
    const input = fakeInput()
    const capture = startCapture(input, 0)
    input.onmidimessage!(message(10, 0x90, 60, 100))
    input.onmidimessage!(message(20, 0x80, 60, 64))
    expect(capture.events.map((event) => event.type)).toEqual([
      'note_on',
      'note_off'
    ])
    expect(capture.events[1].velocity).toBe(64)
  })

  it('retains only note-on and note-off channel messages', () => {
    const input = fakeInput()
    const capture = startCapture(input, 0)
    input.onmidimessage!(message(10, 0xb0, 7, 127)) // control change
    input.onmidimessage!(message(11, 0xc0, 5)) // program change
    input.onmidimessage!(message(12, 0xe0, 0, 64)) // pitch bend
    input.onmidimessage!(message(13, 0x90, 60, 90))
    expect(capture.events).toHaveLength(1)
    expect(capture.events[0].midiPitch).toBe(60)
  })

  it('assigns contiguous sequence numbers in callback order', () => {
    const input = fakeInput()
    const capture = startCapture(input, 0)
    input.onmidimessage!(message(10, 0x90, 60, 100))
    input.onmidimessage!(message(11, 0x90, 62, 100))
    input.onmidimessage!(message(12, 0x80, 60, 0))
    expect(capture.events.map((event) => event.sequenceNumber)).toEqual([
      0, 1, 2
    ])
  })

  it('records count-in notes as negative offsets from the first expected beat', () => {
    const input = fakeInput()
    const capture = startCapture(input, 4000)
    input.onmidimessage!(message(3500.25, 0x90, 60, 100))
    expect(capture.events[0].offsetUs).toBe(-499_750)
  })

  it('ignores messages without data', () => {
    const input = fakeInput()
    const capture = startCapture(input, 0)
    input.onmidimessage!({
      data: null,
      timeStamp: 5
    } as unknown as MIDIMessageEvent)
    expect(capture.events).toHaveLength(0)
  })

  it('stops capturing by detaching the handler', () => {
    const input = fakeInput()
    const capture = startCapture(input, 0)
    dispatch(input, message(10, 0x90, 60, 100))
    capture.stop()
    expect(input.onmidimessage).toBeNull()
    // Notes played after the capture window closes are not recorded.
    dispatch(input, message(11, 0x90, 62, 100))
    expect(capture.events).toHaveLength(1)
  })
})

class FakeAudioContext {
  currentTime = 0
  destination = {}
  createOscillator() {
    return {
      frequency: { value: 0 },
      connect: (target: unknown) => target,
      start: () => undefined,
      stop: () => undefined
    }
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => undefined,
        exponentialRampToValueAtTime: () => undefined
      },
      connect: (target: unknown) => target
    }
  }
  close() {}
}

describe('runExercise submission', () => {
  const submitResponse: SubmitRunResponse = {
    run: { id: 1, exerciseId: 7, firstExpectedBeatAtMs: 0, tempoBpm: 60 },
    originalAssessment: {
      scoringParameters: {
        timingToleranceNoteFraction: 0.1,
        overlapToleranceUs: 30_000,
        maxTimingFaultsPerRun: 0,
        recoveryWindowSteps: 1
      },
      timingToleranceUs: 100_000,
      steps: Array.from({ length: 8 }, (_, stepIndex) => ({
        stepIndex,
        expectedMidiPitch: 60 + stepIndex,
        matchedEventSequenceNumber: stepIndex,
        hardFaultCount: 0,
        missed: false,
        timingDeviationUs: 0,
        timingExcluded: false,
        timingFault: false,
        overlapDurationUs: null,
        overlapReleaseMissing: false,
        overlapFault: false
      })),
      faults: [],
      summary: {
        hardFaultCount: 0,
        timingFaultCount: 0,
        overlapFaultCount: 0,
        timingSampleCount: 8,
        timingExcludedCount: 0,
        meanAbsoluteTimingDeviationUs: 0,
        timingStartOffsetUs: 0,
        passed: true
      }
    },
    progress: {
      exerciseId: 7,
      initialTempoBpm: 60,
      currentTempoBpm: 60,
      consecutiveCleanRuns: 1
    }
  }
  const steps = Array.from({ length: 8 }, (_, stepIndex) => ({
    noteSpelling: 'C',
    fingerNumber: 1,
    stepIndex
  }))

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // The client modules schedule through window.setTimeout and read
    // performance; in the node test environment both are provided here.
    // The fake monotonic clock is frozen at zero and only advances through
    // the fake timers, while the wall-clock origin is a fixed known value.
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('performance', { now: () => 0, timeOrigin: 1_000_000 })
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => submitResponse
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('abandons an aborted run without submitting it', async () => {
    const input = fakeInput()
    const controller = new AbortController()
    const runPromise = runExercise(
      input,
      { id: 7, tempoBpm: 60, notesPerBeat: 1, steps },
      () => undefined,
      { signal: controller.signal }
    )

    input.onmidimessage!(message(4000, 0x90, 60, 100))
    await vi.advanceTimersByTimeAsync(5_000)
    controller.abort()

    // A run cut short is not an attempt: it must not reach the database,
    // where it would count against the streak.
    await expect(runPromise).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()

    // The capture window's own timer must not fire a late submission after
    // the abort already resolved the run.
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('threads the abort signal into the submission fetch', async () => {
    // Make fetch hang so the abort listener has a chance to fire before the
    // submission response arrives. A real browser will cancel the request
    // because the signal is passed through.
    fetchMock.mockImplementationOnce(async () => new Promise(() => undefined))

    const input = fakeInput()
    const controller = new AbortController()
    const runPromise = runExercise(
      input,
      { id: 7, tempoBpm: 60, notesPerBeat: 1, steps },
      () => undefined,
      { signal: controller.signal }
    )

    input.onmidimessage!(message(4000, 0x90, 60, 100))
    await vi.advanceTimersByTimeAsync(13_000)
    controller.abort()

    await expect(runPromise).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBe(controller.signal)
  })

  it('does not start a run that is aborted before it begins', async () => {
    const runPromise = runExercise(
      fakeInput(),
      { id: 7, tempoBpm: 60, notesPerBeat: 1, steps },
      () => undefined,
      { signal: AbortSignal.abort() }
    )
    await expect(runPromise).resolves.toBeNull()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits one request shaped from the capture window, with wall-clock time from performance.timeOrigin', async () => {
    const input = fakeInput()
    const beats: string[] = []
    const runPromise = runExercise(
      input,
      { id: 7, tempoBpm: 60, notesPerBeat: 1, steps },
      (label) => beats.push(label)
    )

    // One note during the count-in and one on the first expected beat.
    input.onmidimessage!(message(3000, 0x90, 60, 100))
    input.onmidimessage!(message(4000, 0x90, 62, 100))
    input.onmidimessage!(message(4500, 0x80, 60, 0))

    // Capture window: 4 count-in + 8 scale beats + 1 tail beat at 60 BPM.
    await vi.advanceTimersByTimeAsync(13_000)
    const result = await runPromise
    expect(result?.response).toEqual(submitResponse)
    // The captured events come back with the response so the end-of-round
    // display can name the pitch actually played for each hard fault; the
    // server does not echo them on submit.
    expect(result?.events).toEqual(
      JSON.parse(fetchMock.mock.calls[0][1].body).events
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/runs')
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      exerciseId: 7,
      // firstExpectedBeat is performance.now() (frozen at 0) plus the
      // four-beat count-in (4000 ms at 60 BPM); the wall-clock value must
      // come from performance.timeOrigin, not from submission time.
      firstExpectedBeatAtMs: 1_004_000,
      tempoBpm: 60,
      events: [
        {
          sequenceNumber: 0,
          offsetUs: -1_000_000,
          type: 'note_on',
          midiPitch: 60,
          velocity: 100
        },
        {
          sequenceNumber: 1,
          offsetUs: 0,
          type: 'note_on',
          midiPitch: 62,
          velocity: 100
        },
        {
          sequenceNumber: 2,
          offsetUs: 500_000,
          type: 'note_off',
          midiPitch: 60,
          velocity: 0
        }
      ]
    })
    expect(beats.slice(0, 4)).toEqual([
      'Count-in: 1/4',
      'Count-in: 2/4',
      'Count-in: 3/4',
      'Count-in: 4/4'
    ])
    expect(beats[4]).toBe('Scale 1: 1/4')
    expect(beats.at(-1)).toBe('Finishing')
    expect(input.onmidimessage).toBeNull()
  })
})
