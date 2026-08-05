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

export type MidiEvent = Static<typeof MidiEventSchema>
export type SubmitRun = Static<typeof SubmitRunSchema>
