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
  stepIndex: Type.Integer({ minimum: 0, maximum: 7 }),
  noteSpelling: Type.String({ minLength: 1 }),
  fingerNumber: Type.Integer({ minimum: 1, maximum: 5 })
})

export const ExerciseSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  direction: Type.Union([
    Type.Literal('ascending'),
    Type.Literal('descending')
  ]),
  currentTempoBpm: Type.Integer({ minimum: 1 }),
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
  groups: Type.Array(ProgressionGroupSchema)
})

export type MidiEvent = Static<typeof MidiEventSchema>
export type SubmitRun = Static<typeof SubmitRunSchema>
export type ExerciseStep = Static<typeof ExerciseStepSchema>
export type Exercise = Static<typeof ExerciseSchema>
export type Scale = Static<typeof ScaleSchema>
export type ProgressionGroup = Static<typeof ProgressionGroupSchema>
export type ExerciseListResponse = Static<typeof ExerciseListResponseSchema>
