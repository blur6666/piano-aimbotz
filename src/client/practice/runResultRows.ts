import type { AssessmentFault, AssessmentStep } from '../api/runs.js'
import { midiNoteName } from '../midi/format.js'

export type TimingCell =
  | { kind: 'missed' }
  | { kind: 'within' | 'outside' | 'excluded'; deviationUs: number }

export type OverlapCell =
  | { kind: 'none' }
  | { kind: 'clean' | 'bleed'; durationUs: number }
  | { kind: 'held' }

export type RunResultRow = {
  stepIndex: number
  noteSpelling: string
  fingerNumber: number
  timing: TimingCell
  overlap: OverlapCell
  // One entry per distinct fault charged to this step, already counted:
  // 'extra F4 ×2' rather than two separate rows. A step with several
  // different mistakes gets several entries.
  faultLabels: string[]
}

export type RunResultInput = {
  exerciseSteps: Array<{ noteSpelling: string; fingerNumber: number }>
  assessmentSteps: AssessmentStep[]
  faults: AssessmentFault[]
  // Captured events for this run, used only to name the pitch actually
  // played for a hard fault. Faults whose event is absent still render,
  // just without a note name.
  events: Array<{ sequenceNumber: number; midiPitch: number }>
}

function faultLabel(
  fault: AssessmentFault,
  pitchBySequence: Map<number, number>
): string {
  if (fault.type === 'missed') return 'not played'
  const pitch =
    fault.eventSequenceNumber === null
      ? undefined
      : pitchBySequence.get(fault.eventSequenceNumber)
  const name = pitch === undefined ? '' : ` ${midiNoteName(pitch)}`
  if (fault.type === 'wrong_pitch') return `wrong note${name}`
  if (fault.type === 'duplicate') return `repeated${name}`
  return `extra${name}`
}

function countLabels(labels: string[]): string[] {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts].map(([label, count]) =>
    count === 1 ? label : `${label} ×${count}`
  )
}

function timingCell(step: AssessmentStep): TimingCell {
  if (step.missed || step.timingDeviationUs === null) return { kind: 'missed' }
  if (step.timingExcluded)
    return { kind: 'excluded', deviationUs: step.timingDeviationUs }
  return {
    kind: step.timingFault ? 'outside' : 'within',
    deviationUs: step.timingDeviationUs
  }
}

function overlapCell(step: AssessmentStep): OverlapCell {
  if (step.overlapReleaseMissing) return { kind: 'held' }
  if (step.overlapDurationUs === null) return { kind: 'none' }
  return {
    kind: step.overlapFault ? 'bleed' : 'clean',
    durationUs: step.overlapDurationUs
  }
}

// One row per expected step, in the order they are played. Hard faults are
// charged to the step the player was heading for, not to the moment they
// happened (src/domain/scoring.ts) -- so a wrong note struck between two
// correct ones lands on the row of the note it displaced, and any extra
// note struck after the final step lands on the final row.
export function buildRunResultRows({
  exerciseSteps,
  assessmentSteps,
  faults,
  events
}: RunResultInput): RunResultRow[] {
  const pitchBySequence = new Map(
    events.map((event) => [event.sequenceNumber, event.midiPitch])
  )
  const labelsByStep = new Map<number, string[]>()
  for (const fault of faults) {
    const existing = labelsByStep.get(fault.stepIndex) ?? []
    existing.push(faultLabel(fault, pitchBySequence))
    labelsByStep.set(fault.stepIndex, existing)
  }

  return assessmentSteps.map((step) => ({
    stepIndex: step.stepIndex,
    noteSpelling: exerciseSteps[step.stepIndex]?.noteSpelling ?? '?',
    fingerNumber: exerciseSteps[step.stepIndex]?.fingerNumber ?? 0,
    timing: timingCell(step),
    overlap: overlapCell(step),
    faultLabels: countLabels(labelsByStep.get(step.stepIndex) ?? [])
  }))
}

export type RunVerdict = {
  passed: boolean
  toleranceMs: number
  // Spacing between consecutive notes, which is what the tolerance is a
  // fraction of. At two notes per beat this is half the beat, and quoting
  // the beat instead would state a rule the scorer is not applying.
  noteIntervalMs: number
  notesPerBeat: number
  tempoBpm: number
  tolerancePercent: number
  allowedTimingFaults: number
  // Empty when the run passed; otherwise one plain-language clause per
  // rule that was broken.
  reasons: string[]
}

export function buildRunVerdict(input: {
  tempoBpm: number
  notesPerBeat: number
  timingToleranceUs: number
  maxTimingFaultsPerRun: number
  hardFaultCount: number
  timingFaultCount: number
  passed: boolean
}): RunVerdict {
  const noteIntervalMs = 60_000 / (input.tempoBpm * input.notesPerBeat)
  const toleranceMs = input.timingToleranceUs / 1000
  const reasons: string[] = []
  if (input.hardFaultCount > 0)
    reasons.push(
      `${input.hardFaultCount} wrong ${input.hardFaultCount === 1 ? 'note' : 'notes'}`
    )
  if (input.timingFaultCount > input.maxTimingFaultsPerRun)
    reasons.push(
      `${input.timingFaultCount} ${input.timingFaultCount === 1 ? 'note' : 'notes'} outside ±${formatMs(toleranceMs)} ms`
    )
  return {
    passed: input.passed,
    toleranceMs,
    noteIntervalMs,
    notesPerBeat: input.notesPerBeat,
    tempoBpm: input.tempoBpm,
    tolerancePercent: (toleranceMs / noteIntervalMs) * 100,
    allowedTimingFaults: input.maxTimingFaultsPerRun,
    reasons
  }
}

function formatMs(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

// "20% of the 375 ms between notes (80 BPM, 2 per beat)" -- the rule
// spelled out with its arithmetic, so a pass or fail never needs to be
// taken on trust. Quotes the note interval, not the beat: at two notes per
// beat those differ, and the beat is not what the scorer measures against.
export function describeTimingRule(verdict: RunVerdict): string {
  const allowance =
    verdict.allowedTimingFaults > 0
      ? `, allowing ${verdict.allowedTimingFaults}`
      : ''
  const grid =
    verdict.notesPerBeat === 1
      ? `${verdict.tempoBpm} BPM, 1 note per beat`
      : `${verdict.tempoBpm} BPM, ${verdict.notesPerBeat} notes per beat`
  return `±${formatMs(verdict.toleranceMs)} ms — ${formatPercent(verdict.tolerancePercent)}% of the ${formatMs(verdict.noteIntervalMs)} ms between notes (${grid})${allowance}`
}
