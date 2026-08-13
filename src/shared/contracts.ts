import { Type, type Static } from '@sinclair/typebox'

export const MidiEventSchema = Type.Object({
  sequenceNumber: Type.Integer({ minimum: 0 }),
  offsetUs: Type.Integer(),
  type: Type.Union([Type.Literal('note_on'), Type.Literal('note_off')]),
  midiPitch: Type.Integer({ minimum: 0, maximum: 127 }),
  velocity: Type.Integer({ minimum: 0, maximum: 127 })
})

export const SubmitRunSchema = Type.Object({
  exerciseId: Type.Integer({ minimum: 1 }),
  firstExpectedBeatAtMs: Type.Integer({ minimum: 0 }),
  tempoBpm: Type.Integer({ minimum: 1 }),
  events: Type.Array(MidiEventSchema)
})

export const ExerciseStepSchema = Type.Object({
  stepIndex: Type.Integer({ minimum: 0, maximum: 14 }),
  noteSpelling: Type.String({ minLength: 1 }),
  fingerNumber: Type.Integer({ minimum: 1, maximum: 5 })
})

export const ExerciseSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  direction: Type.Union([
    Type.Literal('ascending'),
    Type.Literal('descending')
  ]),
  // 1 or 2. The client needs it to label the picker and size the on-screen
  // keyboard; step count follows from it as octaves * 7 + 1.
  octaves: Type.Integer({ minimum: 1, maximum: 2 }),
  currentTempoBpm: Type.Integer({ minimum: 1 }),
  // The immutable seeded tempo. Sent because it is the only way to tell an
  // exercise that has advanced from one that has never been played -- the
  // streak below resets to zero on the run that raises the tempo, so it
  // cannot distinguish them (src/domain/progression/recommendation.ts).
  initialTempoBpm: Type.Integer({ minimum: 1 }),
  // The beat grid the next run will be played and scored against: 2 for
  // straight eighths, 1 for quarters. The client needs it to schedule the
  // metronome and lay out the timeline; the server still applies its own
  // value when scoring rather than trusting a submission.
  notesPerBeat: Type.Integer({ minimum: 1, maximum: 2 }),
  consecutiveCleanRuns: Type.Integer({ minimum: 0 }),
  steps: Type.Array(ExerciseStepSchema)
})

export const ScaleSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  displayName: Type.String({ minLength: 1 }),
  positionInGroup: Type.Integer({ minimum: 1 }),
  exercises: Type.Array(ExerciseSchema)
})

export const ProgressionGroupSchema = Type.Object({
  slug: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  progressionOrder: Type.Integer({ minimum: 1 }),
  scales: Type.Array(ScaleSchema)
})

export const ExerciseListResponseSchema = Type.Object({
  groups: Type.Array(ProgressionGroupSchema),
  // The scale the app tells the player to work on now: the first one not yet
  // cleared, in the progression order the groups above are already sorted
  // into. Null when every scale is cleared. Advisory only -- every exercise
  // stays selectable, and the server enforces no lock (docs/SPEC.md,
  // "Product vision").
  recommendedScaleSlug: Type.Union([Type.String({ minLength: 1 }), Type.Null()])
})

export type MidiEvent = Static<typeof MidiEventSchema>
export type SubmitRun = Static<typeof SubmitRunSchema>
export type ExerciseStep = Static<typeof ExerciseStepSchema>
export type Exercise = Static<typeof ExerciseSchema>
export type Scale = Static<typeof ScaleSchema>
export type ProgressionGroup = Static<typeof ProgressionGroupSchema>
export type ExerciseListResponse = Static<typeof ExerciseListResponseSchema>
