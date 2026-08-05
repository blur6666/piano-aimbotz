export type ScoringConfig = {
  timingToleranceUs: number
  overlapToleranceUs: number
  maxTimingFaultsPerRun: number
  maxOverlapFaultsPerRun: number
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
  steps: StepAssessment[]
  faults: Fault[]
  summary: {
    hardFaultCount: number
    timingFaultCount: number
    overlapFaultCount: number
    timingSampleCount: number
    timingExcludedCount: number
    meanAbsoluteTimingDeviationUs: number | null
    passed: boolean
  }
}

type OrderedEvent = ScoreRunInput['events'][number]

export function scoreRun(input: ScoreRunInput): Assessment {
  const { exercise, tempoBpm, config } = input
  const events = [...input.events].sort(
    (a, b) => a.offsetUs - b.offsetUs || a.sequenceNumber - b.sequenceNumber
  )
  const expectedOffsetUs = (stepIndex: number) =>
    Math.round((stepIndex * 60_000_000) / tempoBpm)
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

  let timingSampleCount = 0
  let timingExcludedCount = 0
  let timingFaultCount = 0
  let timingDeviationTotal = 0
  let overlapFaultCount = 0

  for (let index = 0; index < matchedEvents.length; index += 1) {
    const match = matchedEvents[index]
    const assessment = steps[match.stepIndex]
    const deviation = match.event.offsetUs - assessment.expectedOffsetUs
    assessment.timingDeviationUs = deviation
    if (assessment.timingExcluded) {
      timingExcludedCount += 1
    } else {
      timingSampleCount += 1
      const absoluteDeviation = Math.abs(deviation)
      timingDeviationTotal += absoluteDeviation
      if (absoluteDeviation > config.timingToleranceUs) {
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
      passed:
        hardFaultCount === 0 &&
        timingFaultCount <= config.maxTimingFaultsPerRun &&
        overlapFaultCount <= config.maxOverlapFaultsPerRun
    }
  }
}

// Kept as the small Stage 1 compatibility surface while callers move to scoreRun.
export function countHardFaults(
  tonicPitchClass: number,
  semitoneOffsets: number[],
  events: Array<{ type: 'note_on' | 'note_off'; midiPitch: number }>
): number {
  return scoreRun({
    exercise: {
      direction: 'ascending',
      tonicPitchClass,
      steps: semitoneOffsets.map((semitoneOffset, stepIndex) => ({
        stepIndex,
        semitoneOffset,
        fingerNumber: 1
      }))
    },
    tempoBpm: 60,
    events: events.map((event, sequenceNumber) => ({
      ...event,
      sequenceNumber,
      offsetUs: sequenceNumber,
      velocity: 0
    })),
    config: {
      timingToleranceUs: Number.MAX_SAFE_INTEGER,
      overlapToleranceUs: Number.MAX_SAFE_INTEGER,
      maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
      maxOverlapFaultsPerRun: Number.MAX_SAFE_INTEGER,
      recoveryWindowSteps: 0
    },
    algorithmVersion: 'stage1-compatibility'
  }).summary.hardFaultCount
}
