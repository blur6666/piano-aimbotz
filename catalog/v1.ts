// Versioned catalog data: 3 progression groups, 12 physical major scales,
// 48 exercises -- ascending + descending at one octave (8 steps) and two
// octaves (15 steps) for every scale. Right hand only, per docs/SPEC.md.
//
// Practice order minimises how many physical patterns must be memorised:
// Group 1 (C, G, D, A, E, B) shares one right-hand shape; Group 2 is F,
// the one white-key exception; Group 3's five black-key scales each have
// their own shape but sit most comfortably under the hand.
//
// Fingering source of record: docs/SCALES_FINGERING_REFERENCE.md, Major Scale
// (RH) table. Its charts are two octaves for all twelve scales; the one-octave
// fingering is the first seven fingers, ending on the higher finger of any
// "X/Y" choice. Two-octave fingering repeats the seven-finger cycle and closes
// on the original ending finger -- which reproduces the chart exactly for
// eleven of the twelve. B flat is the sole exception and is stored verbatim
// below. Descending is the exact reverse of ascending.

import type {
  Catalog,
  CatalogExercise,
  CatalogGroup,
  CatalogScale,
  CatalogStep
} from '../src/domain/catalog/index.js'

// Major scale shape (W-W-H-W-W-W-H) as semitone offsets from the tonic.
const ASCENDING_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const

// Two octaves repeat the same seven-degree cycle a twelfth higher, then
// close on the upper tonic: 0 2 4 5 7 9 11 | 12 14 16 17 19 21 23 | 24.
const TWO_OCTAVE_ASCENDING_OFFSETS = [
  ...ASCENDING_OFFSETS.slice(0, 7),
  ...ASCENDING_OFFSETS.slice(0, 7).map((offset) => offset + 12),
  24
] as const

// Two octaves reuse the one-octave cycle: the first seven values repeat,
// then the original closing value ends the scale. Same discipline as the
// descending derivation below -- mechanically derived, no new data:
//   Group 1 [1,2,3,1,2,3,4,5] -> 1 2 3 1 2 3 4 | 1 2 3 1 2 3 4 | 5
//   F major [1,2,3,4,1,2,3,4] -> 1 2 3 4 1 2 3 | 1 2 3 4 1 2 3 | 4
// Verified against the reference chart for eleven of the twelve scales. The
// twelfth, B flat, needs its own row (see twoOctaveFingering) and does not
// come through here.
function repeatCycle<T>(values: readonly T[]): T[] {
  const cycle = values.slice(0, 7)
  return [...cycle, ...cycle, values[7]]
}

type ScaleDefinition = {
  slug: string
  displayName: string
  tonicPitchClass: number
  group: (typeof GROUPS)[number]['slug']
  positionInGroup: number
  notes: readonly string[]
  fingering: readonly number[]
  // Set only where the reference's two-octave row is not what repeatCycle
  // produces. B flat is the only such scale: its second octave starts on 4 --
  // the finger that closes the first octave -- instead of restarting on 2, so
  // the chart reads as a pickup finger followed by two clean seven-cycles.
  // Copied from the reference, not derived; every other scale must stay
  // derived so there is nothing extra to keep in sync.
  twoOctaveFingering?: readonly number[]
}

const GROUPS = [
  { slug: 'group-1', name: 'Group 1 — shared fingering', progressionOrder: 1 },
  {
    slug: 'group-2',
    name: 'Group 2 — the white-key exception',
    progressionOrder: 2
  },
  { slug: 'group-3', name: 'Group 3 — black-key scales', progressionOrder: 3 }
] as const

const SCALES = [
  {
    slug: 'c-major',
    displayName: 'C major',
    tonicPitchClass: 0,
    group: 'group-1',
    positionInGroup: 1,
    notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
    fingering: [1, 2, 3, 1, 2, 3, 4, 5]
  },
  {
    slug: 'g-major',
    displayName: 'G major',
    tonicPitchClass: 7,
    group: 'group-1',
    positionInGroup: 2,
    notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G'],
    fingering: [1, 2, 3, 1, 2, 3, 4, 5]
  },
  {
    slug: 'd-major',
    displayName: 'D major',
    tonicPitchClass: 2,
    group: 'group-1',
    positionInGroup: 3,
    notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'D'],
    fingering: [1, 2, 3, 1, 2, 3, 4, 5]
  },
  {
    slug: 'a-major',
    displayName: 'A major',
    tonicPitchClass: 9,
    group: 'group-1',
    positionInGroup: 4,
    notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#', 'A'],
    fingering: [1, 2, 3, 1, 2, 3, 4, 5]
  },
  {
    slug: 'e-major',
    displayName: 'E major',
    tonicPitchClass: 4,
    group: 'group-1',
    positionInGroup: 5,
    notes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#', 'E'],
    fingering: [1, 2, 3, 1, 2, 3, 4, 5]
  },
  {
    slug: 'b-major',
    displayName: 'B major',
    tonicPitchClass: 11,
    group: 'group-1',
    positionInGroup: 6,
    notes: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#', 'B'],
    fingering: [1, 2, 3, 1, 2, 3, 4, 5]
  },
  {
    slug: 'f-major',
    displayName: 'F major',
    tonicPitchClass: 5,
    group: 'group-2',
    positionInGroup: 1,
    notes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E', 'F'],
    fingering: [1, 2, 3, 4, 1, 2, 3, 4]
  },
  {
    slug: 'b-flat-major',
    displayName: 'B♭ major',
    tonicPitchClass: 10,
    group: 'group-3',
    positionInGroup: 1,
    notes: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
    fingering: [2, 1, 2, 3, 1, 2, 3, 4],
    twoOctaveFingering: [2, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4]
  },
  {
    slug: 'e-flat-major',
    displayName: 'E♭ major',
    tonicPitchClass: 3,
    group: 'group-3',
    positionInGroup: 2,
    notes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb'],
    fingering: [3, 1, 2, 3, 4, 1, 2, 3]
  },
  {
    slug: 'a-flat-major',
    displayName: 'A♭ major',
    tonicPitchClass: 8,
    group: 'group-3',
    positionInGroup: 3,
    notes: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G', 'Ab'],
    fingering: [3, 4, 1, 2, 3, 1, 2, 3]
  },
  {
    slug: 'd-flat-major',
    displayName: 'D♭ major',
    tonicPitchClass: 1,
    group: 'group-3',
    positionInGroup: 4,
    notes: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C', 'Db'],
    fingering: [2, 3, 1, 2, 3, 4, 1, 2]
  },
  {
    slug: 'f-sharp-g-flat-major',
    displayName: 'F♯ / G♭ major',
    tonicPitchClass: 6,
    group: 'group-3',
    positionInGroup: 5,
    notes: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F', 'Gb'],
    fingering: [2, 3, 4, 1, 2, 3, 1, 2]
  }
] satisfies readonly ScaleDefinition[]

// Descending is the exact reverse of ascending: notes, offsets (mirrored
// around the upper tonic), and fingering -- mechanically derived, no new
// descending data.
function buildOctaveExercises(
  def: ScaleDefinition,
  octaves: number
): CatalogExercise[] {
  const notes = octaves === 1 ? [...def.notes] : repeatCycle(def.notes)
  const fingering =
    octaves === 1
      ? [...def.fingering]
      : [...(def.twoOctaveFingering ?? repeatCycle(def.fingering))]
  const offsets =
    octaves === 1 ? ASCENDING_OFFSETS : TWO_OCTAVE_ASCENDING_OFFSETS
  const span = 12 * octaves

  const ascendingSteps: CatalogStep[] = notes.map(
    (noteSpelling, index): CatalogStep => [
      noteSpelling,
      offsets[index],
      fingering[index]
    ]
  )
  const descendingSteps: CatalogStep[] = [...ascendingSteps]
    .reverse()
    .map(
      ([noteSpelling, offset, fingerNumber]): CatalogStep => [
        noteSpelling,
        offset - span,
        fingerNumber
      ]
    )
  return [
    { direction: 'ascending', octaves, steps: ascendingSteps },
    { direction: 'descending', octaves, steps: descendingSteps }
  ]
}

function buildExercises(def: ScaleDefinition): readonly CatalogExercise[] {
  return [...buildOctaveExercises(def, 1), ...buildOctaveExercises(def, 2)]
}

function buildGroup(group: (typeof GROUPS)[number]): CatalogGroup {
  const scales = SCALES.filter((scale) => scale.group === group.slug)
    .sort((a, b) => a.positionInGroup - b.positionInGroup)
    .map(
      (def): CatalogScale => ({
        slug: def.slug,
        displayName: def.displayName,
        tonicPitchClass: def.tonicPitchClass,
        positionInGroup: def.positionInGroup,
        exercises: buildExercises(def)
      })
    )
  return { ...group, scales }
}

export const catalogV1: Catalog = {
  version: 'v1',
  groups: GROUPS.map(buildGroup)
}
