export type ScoringEvent = {
  type: 'note_on' | 'note_off'
  midiPitch: number
}

export function countHardFaults(
  expectedPitches: number[],
  events: ScoringEvent[]
): number {
  let next = 0
  let faults = 0
  for (const event of events) {
    if (event.type !== 'note_on') continue
    if (
      next < expectedPitches.length &&
      event.midiPitch === expectedPitches[next]
    )
      next += 1
    else faults += 1
  }
  return faults
}
