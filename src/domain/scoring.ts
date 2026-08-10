export type ScoringConfig = {
  // Timing tolerance as a fraction of the interval between consecutive
  // expected notes, rather than an absolute duration. Two reasons it is the
  // note interval and not the beat:
  //
  //  - Tempo is the progression axis (docs/SPEC.md), so the gate has to tighten
  //    as tempo climbs, or "clean at 120" would be strictly easier than
  //    "clean at 60" and climbing would mean nothing.
  //  - At two notes per beat the note interval is half the beat. Keying off
  //    the beat would let a note sit a fifth of the way to its neighbour and
  //    still pass, which is not what evenness means.
  //
  // At 0.20 the window is 75ms per note for eighths at 80bpm, and 50ms for
  // eighths at 120bpm.
  timingToleranceNoteFraction: number
  // Display threshold only -- overlap does not gate pass/fail. See the
  // `passed` computation below.
  overlapToleranceUs: number
  maxTimingFaultsPerRun: number
  recoveryWindowSteps: number
}

export type StepAssessment = {
  stepIndex: number
  expectedOffsetUs: number
  expectedMidiPitch: number | null
  matchedEventSequenceNumber: number | null
  hardFaultCount: number
  missed: boolean
  timingDeviationUs: number | null
  timingExcluded: boolean
  timingFault: boolean
  overlapDurationUs: number | null
  overlapReleaseMissing: boolean
  overlapFault: boolean
}

export type Fault = {
  type: 'wrong_pitch' | 'duplicate' | 'missed' | 'extra'
  stepIndex: number
  eventSequenceNumber: number | null
}

export type ScoreRunInput = {
  exercise: {
    direction: 'ascending' | 'descending'
    tonicPitchClass: number
    steps: Array<{
      stepIndex: number
      semitoneOffset: number
      fingerNumber: number
    }>
  }
  tempoBpm: number
  // Expected notes per metronome beat: 1 for quarters, 2 for straight
  // eighths. Stored per run (migrations/0007) because it defines the beat
  // grid a run was played against, so re-scoring an old run stays correct
  // after the default changes.
  notesPerBeat: number
  events: Array<{
    sequenceNumber: number
    offsetUs: number
    type: 'note_on' | 'note_off'
    midiPitch: number
    velocity: number
  }>
  config: ScoringConfig
  algorithmVersion: string
}

export type Assessment = {
  algorithmVersion: string
  scoringParameters: ScoringConfig
  // `timingToleranceNoteFraction` resolved against this run's tempo. Kept
  // on the assessment so a reader (and the end-of-round display) can state
  // the rule it was judged by without re-deriving it from the tempo.
  timingToleranceUs: number
  steps: StepAssessment[]
  faults: Fault[]
  summary: {
    hardFaultCount: number
    timingFaultCount: number
    overlapFaultCount: number
    timingSampleCount: number
    timingExcludedCount: number
    meanAbsoluteTimingDeviationUs: number | null
    // The fitted line's intercept against the metronome grid. It is reported
    // separately from residual unevenness and does not itself cause a fault.
    timingStartOffsetUs: number | null
    passed: boolean
  }
}

type OrderedEvent = ScoreRunInput['events'][number]

export function scoreRun(input: ScoreRunInput): Assessment {
  const { exercise, tempoBpm, notesPerBeat, config } = input
  const events = [...input.events].sort(
    (a, b) => a.offsetUs - b.offsetUs || a.sequenceNumber - b.sequenceNumber
  )
  const noteIntervalUs = 60_000_000 / (tempoBpm * notesPerBeat)
  const timingToleranceUs = Math.round(
    noteIntervalUs * config.timingToleranceNoteFraction
  )
  const expectedOffsetUs = (stepIndex: number) =>
    Math.round(stepIndex * noteIntervalUs)
  const steps: StepAssessment[] = exercise.steps.map((step) => ({
    stepIndex: step.stepIndex,
    expectedOffsetUs: expectedOffsetUs(step.stepIndex),
    expectedMidiPitch: null,
    matchedEventSequenceNumber: null,
    hardFaultCount: 0,
    missed: false,
    timingDeviationUs: null,
    timingExcluded: false,
    timingFault: false,
    overlapDurationUs: null,
    overlapReleaseMissing: false,
    overlapFault: false
  }))
  const faults: Fault[] = []
  const releaseQueues = new Map<number, OrderedEvent[]>()
  const releases = new Map<number, number>()
  const matchedEvents: Array<{ stepIndex: number; event: OrderedEvent }> = []

  for (const event of events) {
    if (event.type === 'note_on') {
      const queue = releaseQueues.get(event.midiPitch) ?? []
      queue.push(event)
      releaseQueues.set(event.midiPitch, queue)
      continue
    }
    const queue = releaseQueues.get(event.midiPitch)
    const onset = queue?.shift()
    if (onset) releases.set(onset.sequenceNumber, event.offsetUs)
  }

  let anchorPitch: number | null = null
  let nextStep = 0
  let previousMatchedPitch: number | null = null
  let recoveryRemaining = 0

  const recordMatch = (stepIndex: number, event: OrderedEvent) => {
    const assessment = steps[stepIndex]
    assessment.matchedEventSequenceNumber = event.sequenceNumber
    assessment.timingExcluded = recoveryRemaining > 0
    if (assessment.timingExcluded) recoveryRemaining -= 1
    matchedEvents.push({ stepIndex, event })
  }

  const addFault = (fault: Fault) => {
    faults.push(fault)
    steps[fault.stepIndex].hardFaultCount += 1
    recoveryRemaining = config.recoveryWindowSteps
  }
  const expectedPitch = (stepIndex: number) =>
    anchorPitch === null
      ? null
      : anchorPitch + exercise.steps[stepIndex].semitoneOffset

  for (const event of events) {
    if (event.type !== 'note_on') continue

    if (anchorPitch === null) {
      if (event.midiPitch % 12 !== exercise.tonicPitchClass) {
        addFault({
          type: 'wrong_pitch',
          stepIndex: 0,
          eventSequenceNumber: event.sequenceNumber
        })
        continue
      }
      anchorPitch = event.midiPitch
      for (const [index, step] of exercise.steps.entries()) {
        steps[index].expectedMidiPitch = anchorPitch + step.semitoneOffset
      }
      recordMatch(0, event)
      previousMatchedPitch = event.midiPitch
      nextStep = 1
      continue
    }

    if (nextStep >= steps.length) {
      addFault({
        type: 'extra',
        stepIndex: steps.length - 1,
        eventSequenceNumber: event.sequenceNumber
      })
      continue
    }

    const currentPitch = expectedPitch(nextStep)
    let matchedStep = currentPitch === event.midiPitch ? nextStep : -1
    if (matchedStep < 0 && event.midiPitch === previousMatchedPitch) {
      addFault({
        type: 'duplicate',
        stepIndex: nextStep,
        eventSequenceNumber: event.sequenceNumber
      })
      continue
    }
    if (matchedStep < 0) {
      for (let index = nextStep + 1; index < steps.length; index += 1) {
        if (expectedPitch(index) === event.midiPitch) {
          matchedStep = index
          break
        }
      }
    }
    if (matchedStep < 0) {
      addFault({
        type: 'extra',
        stepIndex: nextStep,
        eventSequenceNumber: event.sequenceNumber
      })
      continue
    }

    for (let index = nextStep; index < matchedStep; index += 1) {
      steps[index].missed = true
      addFault({
        type: 'missed',
        stepIndex: index,
        eventSequenceNumber: null
      })
    }
    recordMatch(matchedStep, event)
    previousMatchedPitch = event.midiPitch
    nextStep = matchedStep + 1
  }

  for (let index = nextStep; index < steps.length; index += 1) {
    steps[index].missed = true
    addFault({ type: 'missed', stepIndex: index, eventSequenceNumber: null })
  }

  // Fit the player's own line using only samples that will count toward timing.
  // Recovery samples follow a hard fault and must not distort the reference for
  // the rest of the run. With one sample there is no slope to fit, so preserve
  // the nominal slope and report that note's offset as the intercept.
  const timingMatches = matchedEvents.filter(
    (match) => !steps[match.stepIndex].timingExcluded
  )
  const fit = timingMatches.reduce(
    (total, match) => {
      const expected = steps[match.stepIndex].expectedOffsetUs
      total.expected += expected
      total.actual += match.event.offsetUs
      return total
    },
    { expected: 0, actual: 0 }
  )
  const meanExpected =
    timingMatches.length === 0 ? 0 : fit.expected / timingMatches.length
  const meanActual =
    timingMatches.length === 0 ? 0 : fit.actual / timingMatches.length
  const covariance = timingMatches.reduce(
    (total, match) =>
      total +
      (steps[match.stepIndex].expectedOffsetUs - meanExpected) *
        (match.event.offsetUs - meanActual),
    0
  )
  const variance = timingMatches.reduce(
    (total, match) =>
      total + (steps[match.stepIndex].expectedOffsetUs - meanExpected) ** 2,
    0
  )
  const fittedSlope = variance === 0 ? 1 : covariance / variance
  const timingStartOffsetUs =
    timingMatches.length === 0
      ? null
      : Math.round(meanActual - fittedSlope * meanExpected)

  let timingSampleCount = 0
  let timingExcludedCount = 0
  let timingFaultCount = 0
  let timingDeviationTotal = 0
  let overlapFaultCount = 0

  for (let index = 0; index < matchedEvents.length; index += 1) {
    const match = matchedEvents[index]
    const assessment = steps[match.stepIndex]
    const deviation =
      timingStartOffsetUs === null
        ? 0
        : Math.round(
            match.event.offsetUs -
              (timingStartOffsetUs + fittedSlope * assessment.expectedOffsetUs)
          )
    assessment.timingDeviationUs = deviation
    if (assessment.timingExcluded) {
      timingExcludedCount += 1
    } else {
      timingSampleCount += 1
      const absoluteDeviation = Math.abs(deviation)
      timingDeviationTotal += absoluteDeviation
      if (absoluteDeviation > timingToleranceUs) {
        assessment.timingFault = true
        timingFaultCount += 1
      }
    }

    if (index === 0) continue
    const previous = matchedEvents[index - 1].event
    const release = releases.get(previous.sequenceNumber)
    if (release === undefined) {
      assessment.overlapReleaseMissing = true
      assessment.overlapFault = true
      overlapFaultCount += 1
    } else {
      const duration = Math.max(0, release - match.event.offsetUs)
      assessment.overlapDurationUs = duration
      if (duration > config.overlapToleranceUs) {
        assessment.overlapFault = true
        overlapFaultCount += 1
      }
    }
  }

  const hardFaultCount = faults.length
  return {
    algorithmVersion: input.algorithmVersion,
    scoringParameters: config,
    timingToleranceUs,
    steps,
    faults,
    summary: {
      hardFaultCount,
      timingFaultCount,
      overlapFaultCount,
      timingSampleCount,
      timingExcludedCount,
      meanAbsoluteTimingDeviationUs:
        timingSampleCount === 0
          ? null
          : Math.round(timingDeviationTotal / timingSampleCount),
      timingStartOffsetUs,
      // Overlap is measured and reported per step but deliberately does not
      // gate: docs/SPEC.md wants legato bleed captured separately, and no
      // defensible tolerance exists yet. Gating on it with the old zero
      // tolerance made every run unpassable, which stalled progression
      // entirely. Revisit once real sessions exist.
      passed:
        hardFaultCount === 0 && timingFaultCount <= config.maxTimingFaultsPerRun
    }
  }
}
