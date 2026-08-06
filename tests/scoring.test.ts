import { describe, expect, it } from 'vitest'
import {
  scoreRun,
  type Assessment,
  type ScoringConfig
} from '../src/domain/scoring.js'

const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
const cMajorOffsets = cMajor.map((pitch) => pitch - 60)

const hardFaultOnlyConfig: ScoringConfig = {
  timingToleranceNoteFraction: 1_000,
  overlapToleranceUs: Number.MAX_SAFE_INTEGER,
  maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
  recoveryWindowSteps: 0
}

type NoteEvent = {
  type: 'note_on' | 'note_off'
  midiPitch: number
  offsetUs: number
  sequenceNumber?: number
}

// Scores a C-major-ascending run from raw note events, assigning sequence
// numbers by array position unless a test overrides one explicitly (used
// only by the tie-break test, which needs to control sequence number
// independently of input order).
function score(
  events: NoteEvent[],
  overrides: Partial<ScoringConfig> = {}
): Assessment {
  return scoreRun({
    exercise: {
      direction: 'ascending',
      tonicPitchClass: 0,
      steps: cMajorOffsets.map((semitoneOffset, stepIndex) => ({
        stepIndex,
        semitoneOffset,
        fingerNumber: 1
      }))
    },
    tempoBpm: 60,
    notesPerBeat: 1,
    events: events.map((event, index) => ({
      sequenceNumber: event.sequenceNumber ?? index,
      offsetUs: event.offsetUs,
      type: event.type,
      midiPitch: event.midiPitch,
      velocity: 100
    })),
    config: { ...hardFaultOnlyConfig, ...overrides },
    algorithmVersion: 'test'
  })
}

function countHardFaults(
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
    notesPerBeat: 1,
    events: events.map((event, sequenceNumber) => ({
      ...event,
      sequenceNumber,
      offsetUs: sequenceNumber * 1_000_000,
      velocity: 100
    })),
    config: hardFaultOnlyConfig,
    algorithmVersion: 'test'
  }).summary.hardFaultCount
}

describe('Stage 1 hard faults', () => {
  it('counts only note-ons that are not the next expected note', () => {
    expect(
      countHardFaults(0, cMajorOffsets, [
        { type: 'note_on', midiPitch: 60 },
        { type: 'note_on', midiPitch: 61 },
        { type: 'note_off', midiPitch: 60 },
        ...cMajor
          .slice(1)
          .map((midiPitch) => ({ type: 'note_on' as const, midiPitch }))
      ])
    ).toBe(1)
  })

  it('continues after a wrong note and counts duplicates', () => {
    expect(
      countHardFaults(0, cMajorOffsets, [
        ...cMajor
          .slice(0, 3)
          .map((midiPitch) => ({ type: 'note_on' as const, midiPitch })),
        { type: 'note_on', midiPitch: 64 },
        ...cMajor
          .slice(3)
          .map((midiPitch) => ({ type: 'note_on' as const, midiPitch }))
      ])
    ).toBe(1)
  })

  it('anchors the octave from the first correct tonic', () => {
    expect(
      countHardFaults(
        0,
        cMajorOffsets,
        cMajor.map((pitch) => ({
          type: 'note_on' as const,
          midiPitch: pitch - 12
        }))
      )
    ).toBe(0)
  })
})

describe('descending exercises', () => {
  // The `direction` field is not read anywhere inside scoreRun -- matching
  // is driven entirely by each step's stored semitone offset. This proves
  // the scorer already handles a descending exercise correctly, even
  // though nothing in the seed/catalog can create one yet.
  it('scores a clean descending run with zero hard faults', () => {
    // C major descending, anchored on the upper C: C B A G F E D C
    const descendingOffsets = [0, -1, -3, -5, -7, -8, -10, -12]
    const anchorPitch = 72 // upper C
    const config = {
      timingToleranceNoteFraction: 1_000,
      overlapToleranceUs: Number.MAX_SAFE_INTEGER,
      maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
      recoveryWindowSteps: 0
    }
    const assessment = scoreRun({
      exercise: {
        direction: 'descending',
        tonicPitchClass: 0,
        steps: descendingOffsets.map((semitoneOffset, stepIndex) => ({
          stepIndex,
          semitoneOffset,
          fingerNumber: 1
        }))
      },
      tempoBpm: 60,
      notesPerBeat: 1,
      events: descendingOffsets.map((offset, index) => ({
        sequenceNumber: index,
        offsetUs: index * 1_000_000,
        type: 'note_on' as const,
        midiPitch: anchorPitch + offset,
        velocity: 100
      })),
      config,
      algorithmVersion: 'test'
    })

    expect(assessment.summary.hardFaultCount).toBe(0)
    expect(assessment.steps.map((step) => step.expectedMidiPitch)).toEqual([
      72, 71, 69, 67, 65, 64, 62, 60
    ])
    expect(assessment.steps.every((step) => !step.missed)).toBe(true)
  })
})

describe('wrong pitch before the tonic anchors', () => {
  it('records a wrong_pitch fault against step 0 for every note-on before the correct tonic', () => {
    const assessment = score([
      { type: 'note_on', midiPitch: 61, offsetUs: 0 }, // C#, wrong pitch class
      { type: 'note_on', midiPitch: 65, offsetUs: 500_000 }, // F, wrong pitch class
      { type: 'note_on', midiPitch: 60, offsetUs: 1_000_000 }, // C, anchors
      ...cMajor.slice(1).map((midiPitch, index) => ({
        type: 'note_on' as const,
        midiPitch,
        offsetUs: (index + 2) * 1_000_000
      }))
    ])

    expect(assessment.summary.hardFaultCount).toBe(2)
    expect(
      assessment.faults.map((fault) => ({
        type: fault.type,
        stepIndex: fault.stepIndex,
        eventSequenceNumber: fault.eventSequenceNumber
      }))
    ).toEqual([
      { type: 'wrong_pitch', stepIndex: 0, eventSequenceNumber: 0 },
      { type: 'wrong_pitch', stepIndex: 0, eventSequenceNumber: 1 }
    ])
    expect(assessment.steps[0].hardFaultCount).toBe(2)
    expect(assessment.steps[0].matchedEventSequenceNumber).toBe(2)
    expect(assessment.steps.every((step) => !step.missed)).toBe(true)
  })
})

describe('wrong octave after anchoring', () => {
  it('treats a correct pitch class at the wrong octave as an extra, not a match', () => {
    const assessment = score([
      { type: 'note_on', midiPitch: 60, offsetUs: 0 }, // C, anchors
      { type: 'note_on', midiPitch: 74, offsetUs: 1_000_000 }, // D one octave up
      { type: 'note_on', midiPitch: 62, offsetUs: 1_500_000 }, // correct D
      ...cMajor.slice(2).map((midiPitch, index) => ({
        type: 'note_on' as const,
        midiPitch,
        offsetUs: (index + 2) * 1_000_000
      }))
    ])

    expect(assessment.summary.hardFaultCount).toBe(1)
    expect(assessment.faults).toEqual([
      { type: 'extra', stepIndex: 1, eventSequenceNumber: 1 }
    ])
    expect(assessment.steps[1].matchedEventSequenceNumber).toBe(2)
    expect(assessment.steps.every((step) => !step.missed)).toBe(true)
  })
})

describe('resynchronization', () => {
  it('marks skipped steps missed and resumes matching at a later expected pitch', () => {
    const assessment = score([
      { type: 'note_on', midiPitch: 60, offsetUs: 0 }, // C, anchors (step 0)
      // D (step 1) and E (step 2) are never played.
      { type: 'note_on', midiPitch: 65, offsetUs: 1_000_000 }, // F (step 3)
      { type: 'note_on', midiPitch: 67, offsetUs: 2_000_000 }, // G (step 4)
      { type: 'note_on', midiPitch: 69, offsetUs: 3_000_000 }, // A (step 5)
      { type: 'note_on', midiPitch: 71, offsetUs: 4_000_000 }, // B (step 6)
      { type: 'note_on', midiPitch: 72, offsetUs: 5_000_000 } // C (step 7)
    ])

    expect(assessment.summary.hardFaultCount).toBe(2)
    expect(
      assessment.faults.map((fault) => ({
        type: fault.type,
        stepIndex: fault.stepIndex
      }))
    ).toEqual([
      { type: 'missed', stepIndex: 1 },
      { type: 'missed', stepIndex: 2 }
    ])
    expect(assessment.steps[1].missed).toBe(true)
    expect(assessment.steps[2].missed).toBe(true)
    expect(assessment.steps[3].matchedEventSequenceNumber).toBe(1)
    expect(assessment.steps.slice(4).every((step) => !step.missed)).toBe(true)
  })
})

describe('extra note-ons after step 7 is matched', () => {
  it('attributes every trailing extra to the last step', () => {
    const assessment = score([
      ...cMajor.map((midiPitch, index) => ({
        type: 'note_on' as const,
        midiPitch,
        offsetUs: index * 1_000_000
      })),
      { type: 'note_on', midiPitch: 73, offsetUs: 8_000_000 },
      { type: 'note_on', midiPitch: 74, offsetUs: 9_000_000 }
    ])

    expect(assessment.summary.hardFaultCount).toBe(2)
    expect(
      assessment.faults.map((fault) => ({
        type: fault.type,
        stepIndex: fault.stepIndex
      }))
    ).toEqual([
      { type: 'extra', stepIndex: 7 },
      { type: 'extra', stepIndex: 7 }
    ])
    expect(assessment.steps[7].hardFaultCount).toBe(2)
  })
})

describe('per-step fault attribution', () => {
  it('sums step hardFaultCount and faults[] entries to the aggregate across every fault type', () => {
    const assessment = score([
      { type: 'note_on', midiPitch: 61, offsetUs: 0 }, // wrong pitch, pre-anchor
      { type: 'note_on', midiPitch: 60, offsetUs: 1_000_000 }, // C, anchors
      { type: 'note_on', midiPitch: 74, offsetUs: 2_000_000 }, // wrong-octave D -> extra
      { type: 'note_on', midiPitch: 62, offsetUs: 2_500_000 }, // correct D
      // E (step 2) and F (step 3) skipped -> resync to G.
      { type: 'note_on', midiPitch: 67, offsetUs: 3_000_000 }, // G (step 4)
      { type: 'note_on', midiPitch: 69, offsetUs: 4_000_000 }, // A (step 5)
      { type: 'note_on', midiPitch: 71, offsetUs: 5_000_000 }, // B (step 6)
      { type: 'note_on', midiPitch: 72, offsetUs: 6_000_000 }, // C (step 7)
      { type: 'note_on', midiPitch: 73, offsetUs: 7_000_000 }, // trailing extra
      { type: 'note_on', midiPitch: 74, offsetUs: 8_000_000 } // trailing extra
    ])

    expect(assessment.summary.hardFaultCount).toBe(6)
    expect(assessment.faults).toHaveLength(6)
    const summedPerStep = assessment.steps.reduce(
      (total, step) => total + step.hardFaultCount,
      0
    )
    expect(summedPerStep).toBe(assessment.summary.hardFaultCount)
    expect(assessment.steps.map((step) => step.hardFaultCount)).toEqual([
      1, 1, 1, 1, 0, 0, 0, 2
    ])
  })
})

describe('equal-offset tie-break', () => {
  it('resolves identical offsetUs values by sequenceNumber, not input array order', () => {
    // Input order deliberately places the higher sequence number first;
    // if the scorer used array order instead of re-sorting by
    // sequenceNumber, D would be matched before the duplicate C is seen,
    // producing an 'extra' fault instead of a 'duplicate' one.
    const assessment = score([
      { type: 'note_on', midiPitch: 60, offsetUs: 0, sequenceNumber: 0 }, // C, anchors
      {
        type: 'note_on',
        midiPitch: 62,
        offsetUs: 1_000_000,
        sequenceNumber: 5
      }, // D
      { type: 'note_on', midiPitch: 60, offsetUs: 1_000_000, sequenceNumber: 3 } // duplicate C, same offset
    ])

    // Steps 2-7 are also unplayed missed faults here (the run stops after
    // step 1); only the tie-break outcome itself is under test.
    expect(assessment.faults[0]).toEqual({
      type: 'duplicate',
      stepIndex: 1,
      eventSequenceNumber: 3
    })
    expect(assessment.steps[1].matchedEventSequenceNumber).toBe(5)
  })
})

describe('timing deviation boundaries', () => {
  it('does not fault a deviation exactly at tolerance, and faults one microsecond over', () => {
    const assessment = score(
      [
        { type: 'note_on', midiPitch: 60, offsetUs: 0 }, // C, on time
        { type: 'note_on', midiPitch: 62, offsetUs: 1_050_000 }, // D, +50,000us
        { type: 'note_on', midiPitch: 64, offsetUs: 2_050_001 } // E, +50,001us
      ],
      // 5% of the 1,000,000us beat at 60bpm.
      { timingToleranceNoteFraction: 0.05 }
    )

    expect(assessment.steps[1].timingDeviationUs).toBe(50_000)
    expect(assessment.steps[1].timingFault).toBe(false)
    expect(assessment.steps[2].timingDeviationUs).toBe(50_001)
    expect(assessment.steps[2].timingFault).toBe(true)
    expect(assessment.summary.timingFaultCount).toBe(1)
  })
})

describe('timing exclusion window', () => {
  it('excludes matched steps for exactly the configured window after a fault, and the window restarts on a second fault', () => {
    const assessment = score(
      [
        { type: 'note_on', midiPitch: 60, offsetUs: 0 }, // C, anchors
        { type: 'note_on', midiPitch: 61, offsetUs: 900_000 }, // wrong note -> fault #1
        { type: 'note_on', midiPitch: 62, offsetUs: 1_000_000 }, // D, excluded (window #1)
        { type: 'note_on', midiPitch: 64, offsetUs: 2_000_000 }, // E, not excluded
        { type: 'note_on', midiPitch: 61, offsetUs: 2_900_000 }, // wrong note -> fault #2
        { type: 'note_on', midiPitch: 65, offsetUs: 3_000_000 }, // F, excluded (window #2)
        { type: 'note_on', midiPitch: 67, offsetUs: 4_000_000 }, // G, not excluded
        { type: 'note_on', midiPitch: 69, offsetUs: 5_000_000 }, // A
        { type: 'note_on', midiPitch: 71, offsetUs: 6_000_000 }, // B
        { type: 'note_on', midiPitch: 72, offsetUs: 7_000_000 } // C
      ],
      { recoveryWindowSteps: 1 }
    )

    expect(assessment.summary.hardFaultCount).toBe(2)
    expect(assessment.steps[1].timingExcluded).toBe(true) // D
    expect(assessment.steps[2].timingExcluded).toBe(false) // E
    expect(assessment.steps[3].timingExcluded).toBe(true) // F
    expect(assessment.steps[4].timingExcluded).toBe(false) // G
    expect(assessment.summary.timingExcludedCount).toBe(2)
    // 8 matched steps total, 2 excluded -> 6 counted samples.
    expect(assessment.summary.timingSampleCount).toBe(6)
  })
})

describe('overlap', () => {
  it('faults overlap only when release comes strictly after the next onset, and a missing release always faults', () => {
    const assessment = score(
      [
        { type: 'note_on', midiPitch: 60, offsetUs: 0 }, // C (step 0)
        { type: 'note_off', midiPitch: 60, offsetUs: 500_000 }, // released well before D
        { type: 'note_on', midiPitch: 62, offsetUs: 1_000_000 }, // D (step 1) - release before onset
        { type: 'note_off', midiPitch: 62, offsetUs: 2_000_000 }, // released exactly at E's onset
        { type: 'note_on', midiPitch: 64, offsetUs: 2_000_000 }, // E (step 2) - release at onset
        { type: 'note_off', midiPitch: 64, offsetUs: 3_200_000 }, // released after F's onset
        { type: 'note_on', midiPitch: 65, offsetUs: 3_000_000 }, // F (step 3) - release after onset
        { type: 'note_on', midiPitch: 67, offsetUs: 4_000_000 } // G (step 4) - F never released
      ],
      { overlapToleranceUs: 0 }
    )

    expect(assessment.steps[1].overlapFault).toBe(false) // before
    expect(assessment.steps[1].overlapDurationUs).toBe(0)
    expect(assessment.steps[2].overlapFault).toBe(false) // at
    expect(assessment.steps[2].overlapDurationUs).toBe(0)
    expect(assessment.steps[3].overlapFault).toBe(true) // after
    expect(assessment.steps[3].overlapDurationUs).toBe(200_000)
    expect(assessment.steps[4].overlapFault).toBe(true) // missing release
    expect(assessment.steps[4].overlapReleaseMissing).toBe(true)
    expect(assessment.summary.overlapFaultCount).toBe(2)
  })
})

describe('velocity', () => {
  it('has no effect on scoring', () => {
    const events = cMajor.map((midiPitch, index) => ({
      type: 'note_on' as const,
      midiPitch,
      offsetUs: index * 1_000_000
    }))
    const quiet = scoreRun({
      exercise: {
        direction: 'ascending',
        tonicPitchClass: 0,
        steps: cMajorOffsets.map((semitoneOffset, stepIndex) => ({
          stepIndex,
          semitoneOffset,
          fingerNumber: 1
        }))
      },
      tempoBpm: 60,
      notesPerBeat: 1,
      events: events.map((event, index) => ({
        ...event,
        sequenceNumber: index,
        velocity: 1
      })),
      config: hardFaultOnlyConfig,
      algorithmVersion: 'test'
    })
    const loud = scoreRun({
      exercise: {
        direction: 'ascending',
        tonicPitchClass: 0,
        steps: cMajorOffsets.map((semitoneOffset, stepIndex) => ({
          stepIndex,
          semitoneOffset,
          fingerNumber: 1
        }))
      },
      tempoBpm: 60,
      notesPerBeat: 1,
      events: events.map((event, index) => ({
        ...event,
        sequenceNumber: index,
        velocity: 127
      })),
      config: hardFaultOnlyConfig,
      algorithmVersion: 'test'
    })

    expect(quiet).toEqual(loud)
  })
})

describe('summary.passed against configured maxima', () => {
  it('passes at the configured timing-fault maximum and fails one over it', () => {
    const events: NoteEvent[] = [
      { type: 'note_on', midiPitch: 60, offsetUs: 0 },
      { type: 'note_on', midiPitch: 62, offsetUs: 1_000_001 }, // faults with zero tolerance
      { type: 'note_on', midiPitch: 64, offsetUs: 2_000_001 }, // faults with zero tolerance
      { type: 'note_on', midiPitch: 65, offsetUs: 3_000_000 },
      { type: 'note_on', midiPitch: 67, offsetUs: 4_000_000 },
      { type: 'note_on', midiPitch: 69, offsetUs: 5_000_000 },
      { type: 'note_on', midiPitch: 71, offsetUs: 6_000_000 },
      { type: 'note_on', midiPitch: 72, offsetUs: 7_000_000 }
    ]

    const atMax = score(events, {
      timingToleranceNoteFraction: 0,
      maxTimingFaultsPerRun: 2
    })
    expect(atMax.summary.timingFaultCount).toBe(2)
    expect(atMax.summary.hardFaultCount).toBe(0)
    expect(atMax.summary.passed).toBe(true)

    const overMax = score(events, {
      timingToleranceNoteFraction: 0,
      maxTimingFaultsPerRun: 1
    })
    expect(overMax.summary.timingFaultCount).toBe(2)
    expect(overMax.summary.passed).toBe(false)
  })

  it('reports overlap faults without letting them fail an otherwise clean run', () => {
    // Every note gets an explicit, clean release before the next onset
    // except C and D, which deliberately overlap D and E respectively. A
    // missing release always faults regardless of tolerance, so every
    // other note needs a release to keep the fault count at exactly 2.
    const events: NoteEvent[] = [
      { type: 'note_on', midiPitch: 60, offsetUs: 0 },
      { type: 'note_off', midiPitch: 60, offsetUs: 1_200_000 }, // overlaps D
      { type: 'note_on', midiPitch: 62, offsetUs: 1_000_000 },
      { type: 'note_off', midiPitch: 62, offsetUs: 2_200_000 }, // overlaps E
      { type: 'note_on', midiPitch: 64, offsetUs: 2_000_000 },
      { type: 'note_off', midiPitch: 64, offsetUs: 2_500_000 },
      { type: 'note_on', midiPitch: 65, offsetUs: 3_000_000 },
      { type: 'note_off', midiPitch: 65, offsetUs: 3_500_000 },
      { type: 'note_on', midiPitch: 67, offsetUs: 4_000_000 },
      { type: 'note_off', midiPitch: 67, offsetUs: 4_500_000 },
      { type: 'note_on', midiPitch: 69, offsetUs: 5_000_000 },
      { type: 'note_off', midiPitch: 69, offsetUs: 5_500_000 },
      { type: 'note_on', midiPitch: 71, offsetUs: 6_000_000 },
      { type: 'note_off', midiPitch: 71, offsetUs: 6_500_000 },
      { type: 'note_on', midiPitch: 72, offsetUs: 7_000_000 }
    ]

    const assessment = score(events, { overlapToleranceUs: 0 })
    expect(assessment.summary.overlapFaultCount).toBe(2)
    expect(assessment.steps[1].overlapFault).toBe(true)
    expect(assessment.steps[1].overlapDurationUs).toBe(200_000)
    expect(assessment.summary.hardFaultCount).toBe(0)
    // Overlap is reported per step but deliberately does not gate: no
    // defensible tolerance exists yet, and gating on it at zero tolerance
    // made every real run unpassable.
    expect(assessment.summary.passed).toBe(true)
  })

  it('resolves the timing tolerance against the note interval, so the same fraction tightens with tempo and with notes per beat', () => {
    const config: ScoringConfig = {
      ...hardFaultOnlyConfig,
      timingToleranceNoteFraction: 0.1,
      maxTimingFaultsPerRun: 0
    }
    // Second note played 60ms after its expected slot, whatever that slot is.
    const at = (tempoBpm: number, notesPerBeat: number) => {
      const noteIntervalUs = 60_000_000 / (tempoBpm * notesPerBeat)
      return scoreRun({
        exercise: {
          direction: 'ascending',
          tonicPitchClass: 0,
          steps: cMajorOffsets.map((semitoneOffset, stepIndex) => ({
            stepIndex,
            semitoneOffset,
            fingerNumber: 1
          }))
        },
        tempoBpm,
        notesPerBeat,
        events: [
          { type: 'note_on' as const, midiPitch: 60, offsetUs: 0 },
          {
            type: 'note_on' as const,
            midiPitch: 62,
            offsetUs: noteIntervalUs + 60_000
          }
        ].map((event, sequenceNumber) => ({
          ...event,
          sequenceNumber,
          velocity: 100
        })),
        config,
        algorithmVersion: 'test'
      })
    }

    // Quarters at 60bpm: 1000ms between notes, 100ms window.
    const quartersSlow = at(60, 1)
    expect(quartersSlow.timingToleranceUs).toBe(100_000)
    expect(quartersSlow.steps[1].timingFault).toBe(false)

    // Same tempo, but eighths halve the interval and so halve the window.
    const eighthsSlow = at(60, 2)
    expect(eighthsSlow.timingToleranceUs).toBe(50_000)
    expect(eighthsSlow.steps[1].timingFault).toBe(true)

    // Doubling the tempo halves it again.
    const quartersFast = at(120, 1)
    expect(quartersFast.timingToleranceUs).toBe(50_000)
    expect(quartersFast.steps[1].timingFault).toBe(true)
  })

  it('places expected notes half a beat apart when there are two notes per beat', () => {
    const assessment = scoreRun({
      exercise: {
        direction: 'ascending',
        tonicPitchClass: 0,
        steps: cMajorOffsets.map((semitoneOffset, stepIndex) => ({
          stepIndex,
          semitoneOffset,
          fingerNumber: 1
        }))
      },
      tempoBpm: 80,
      notesPerBeat: 2,
      // Eight notes played exactly on a 375ms grid: 80bpm is a 750ms beat.
      events: cMajor.map((midiPitch, index) => ({
        sequenceNumber: index,
        offsetUs: Math.round(index * 375_000),
        type: 'note_on' as const,
        midiPitch,
        velocity: 100
      })),
      config: { ...hardFaultOnlyConfig, maxTimingFaultsPerRun: 0 },
      algorithmVersion: 'test'
    })

    expect(assessment.steps.map((step) => step.expectedOffsetUs)).toEqual([
      0, 375_000, 750_000, 1_125_000, 1_500_000, 1_875_000, 2_250_000, 2_625_000
    ])
    expect(assessment.summary.hardFaultCount).toBe(0)
    expect(assessment.steps.every((step) => step.timingDeviationUs === 0)).toBe(
      true
    )
  })
})
