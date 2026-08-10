import { describe, expect, it } from 'vitest'
import type { AssessmentFault, AssessmentStep } from '../src/client/api/runs.js'
import {
  buildRunResultRows,
  buildRunVerdict,
  describeTimingRule
} from '../src/client/practice/runResultRows.js'

const cMajor = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']
const fingers = [1, 2, 3, 1, 2, 3, 4, 5]

const exerciseSteps = cMajor.map((noteSpelling, index) => ({
  noteSpelling,
  fingerNumber: fingers[index]
}))

function step(overrides: Partial<AssessmentStep> = {}): AssessmentStep {
  return {
    stepIndex: 0,
    expectedMidiPitch: 60,
    matchedEventSequenceNumber: 0,
    hardFaultCount: 0,
    missed: false,
    timingDeviationUs: 0,
    timingExcluded: false,
    timingFault: false,
    overlapDurationUs: null,
    overlapReleaseMissing: false,
    overlapFault: false,
    ...overrides
  }
}

function rowsFor(
  assessmentSteps: AssessmentStep[],
  faults: AssessmentFault[] = [],
  events: Array<{ sequenceNumber: number; midiPitch: number }> = []
) {
  return buildRunResultRows({
    exerciseSteps,
    assessmentSteps,
    faults,
    events
  })
}

describe('buildRunResultRows', () => {
  it('pairs each assessment step with the note and finger it was played on', () => {
    const rows = rowsFor(
      Array.from({ length: 8 }, (_, stepIndex) => step({ stepIndex }))
    )
    expect(rows).toHaveLength(8)
    expect(rows.map((row) => row.noteSpelling)).toEqual(cMajor)
    expect(rows.map((row) => row.fingerNumber)).toEqual(fingers)
  })

  it('separates a within-tolerance deviation from one that faulted', () => {
    const rows = rowsFor([
      step({ stepIndex: 0, timingDeviationUs: 22_000 }),
      step({ stepIndex: 1, timingDeviationUs: -97_000, timingFault: true })
    ])
    expect(rows[0].timing).toEqual({ kind: 'within', deviationUs: 22_000 })
    expect(rows[1].timing).toEqual({ kind: 'outside', deviationUs: -97_000 })
  })

  it('marks a step excluded by the recovery window rather than counting it', () => {
    // SPEC.md: the note after a stumble is late for reasons that have
    // nothing to do with timing, so it must not read as a timing result.
    const rows = rowsFor([
      step({ stepIndex: 0, timingDeviationUs: 180_000, timingExcluded: true })
    ])
    expect(rows[0].timing).toEqual({ kind: 'excluded', deviationUs: 180_000 })
  })

  it('renders a missed step with no timing and no overlap', () => {
    const rows = rowsFor([
      step({ stepIndex: 0, missed: true, timingDeviationUs: null })
    ])
    expect(rows[0].timing).toEqual({ kind: 'missed' })
    expect(rows[0].overlap).toEqual({ kind: 'none' })
  })

  it('distinguishes clean, bleeding and never-released overlap', () => {
    const rows = rowsFor([
      step({ stepIndex: 0 }),
      step({ stepIndex: 1, overlapDurationUs: 4_000 }),
      step({ stepIndex: 2, overlapDurationUs: 180_000, overlapFault: true }),
      step({ stepIndex: 3, overlapReleaseMissing: true, overlapFault: true })
    ])
    // The first matched step has no previous note to bleed from.
    expect(rows[0].overlap).toEqual({ kind: 'none' })
    expect(rows[1].overlap).toEqual({ kind: 'clean', durationUs: 4_000 })
    expect(rows[2].overlap).toEqual({ kind: 'bleed', durationUs: 180_000 })
    expect(rows[3].overlap).toEqual({ kind: 'held' })
  })

  it('names the pitch actually played for a hard fault', () => {
    const rows = rowsFor(
      [step({ stepIndex: 0 }), step({ stepIndex: 1 })],
      [{ type: 'extra', stepIndex: 1, eventSequenceNumber: 4 }],
      [{ sequenceNumber: 4, midiPitch: 65 }]
    )
    expect(rows[1].faultLabels).toEqual(['extra F4'])
  })

  it('collapses repeats of the same fault into one counted entry', () => {
    const rows = rowsFor(
      [step({ stepIndex: 0 })],
      [
        { type: 'extra', stepIndex: 0, eventSequenceNumber: 1 },
        { type: 'extra', stepIndex: 0, eventSequenceNumber: 2 },
        { type: 'duplicate', stepIndex: 0, eventSequenceNumber: 3 }
      ],
      [
        { sequenceNumber: 1, midiPitch: 65 },
        { sequenceNumber: 2, midiPitch: 65 },
        { sequenceNumber: 3, midiPitch: 60 }
      ]
    )
    expect(rows[0].faultLabels).toEqual(['extra F4 ×2', 'repeated C4'])
  })

  it('labels a missed fault without inventing a pitch', () => {
    const rows = rowsFor(
      [step({ stepIndex: 0, missed: true, timingDeviationUs: null })],
      [{ type: 'missed', stepIndex: 0, eventSequenceNumber: null }]
    )
    expect(rows[0].faultLabels).toEqual(['not played'])
  })

  it('charges a fault to the step it was recorded against', () => {
    // scoreRun attributes a hard fault to the step the player was heading
    // for, not to the moment it happened; the display must not re-attribute
    // it or the two disagree.
    const rows = rowsFor(
      [step({ stepIndex: 0 }), step({ stepIndex: 1 }), step({ stepIndex: 2 })],
      [{ type: 'wrong_pitch', stepIndex: 2, eventSequenceNumber: 9 }],
      [{ sequenceNumber: 9, midiPitch: 66 }]
    )
    expect(rows[0].faultLabels).toEqual([])
    expect(rows[1].faultLabels).toEqual([])
    expect(rows[2].faultLabels).toEqual(['wrong note F#4'])
  })
})

describe('buildRunVerdict', () => {
  const clean = {
    tempoBpm: 60,
    notesPerBeat: 1,
    timingToleranceUs: 100_000,
    maxTimingFaultsPerRun: 0,
    hardFaultCount: 0,
    timingFaultCount: 0,
    passed: true
  }

  it('gives no reasons for a passing run', () => {
    expect(buildRunVerdict(clean).reasons).toEqual([])
  })

  it('states every broken rule for a failing run', () => {
    const verdict = buildRunVerdict({
      ...clean,
      hardFaultCount: 2,
      timingFaultCount: 3,
      passed: false
    })
    expect(verdict.reasons).toEqual([
      '2 wrong notes',
      '3 notes outside ±100 ms'
    ])
  })

  it('singularises a lone fault', () => {
    const verdict = buildRunVerdict({
      ...clean,
      hardFaultCount: 1,
      passed: false
    })
    expect(verdict.reasons).toEqual(['1 wrong note'])
  })

  it('does not report timing as broken while it is inside the allowance', () => {
    const verdict = buildRunVerdict({
      ...clean,
      maxTimingFaultsPerRun: 2,
      timingFaultCount: 2
    })
    expect(verdict.reasons).toEqual([])
  })

  it('spells out the rule with its arithmetic', () => {
    expect(describeTimingRule(buildRunVerdict(clean))).toBe(
      '±100 ms — 10% of the 1000 ms between notes (60 BPM, 1 note per beat)'
    )
  })

  it('restates the same fraction as a tighter window at a higher tempo', () => {
    const verdict = buildRunVerdict({
      ...clean,
      tempoBpm: 120,
      timingToleranceUs: 50_000
    })
    expect(describeTimingRule(verdict)).toBe(
      '±50 ms — 10% of the 500 ms between notes (120 BPM, 1 note per beat)'
    )
  })

  it('quotes the note interval rather than the beat when they differ', () => {
    // 75ms is 20% of the 375ms between eighths at 80bpm, and also 10% of
    // the 750ms beat. Both readings are arithmetically true, but only the
    // first is the rule scoreRun applies -- so the wrong one would go
    // unnoticed here and mislead at any other setting.
    const verdict = buildRunVerdict({
      ...clean,
      tempoBpm: 80,
      notesPerBeat: 2,
      timingToleranceUs: 75_000
    })
    expect(describeTimingRule(verdict)).toBe(
      '±75 ms — 20% of the 375 ms between notes (80 BPM, 2 notes per beat)'
    )
  })

  it('mentions the allowance when one is configured', () => {
    const verdict = buildRunVerdict({ ...clean, maxTimingFaultsPerRun: 1 })
    expect(describeTimingRule(verdict)).toBe(
      '±100 ms — 10% of the 1000 ms between notes (60 BPM, 1 note per beat), allowing 1'
    )
  })
})
