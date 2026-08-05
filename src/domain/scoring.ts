export type ScoringEvent = {
  type: 'note_on' | 'note_off'
  midiPitch: number
}

export function countHardFaults(
  tonicPitchClass: number,
  semitoneOffsets: number[],
  events: ScoringEvent[]
): number {
  let next = 0
  let faults = 0
  let anchorPitch: number | null = null
  for (const event of events) {
    if (event.type !== 'note_on') continue
    if (anchorPitch === null) {
      if (event.midiPitch % 12 === tonicPitchClass) {
        anchorPitch = event.midiPitch
        next = 1
      } else faults += 1
      continue
    }
    const expectedPitch =
      next < semitoneOffsets.length ? anchorPitch + semitoneOffsets[next] : null
    if (expectedPitch !== null && event.midiPitch === expectedPitch) next += 1
    else faults += 1
  }
  return faults
}
