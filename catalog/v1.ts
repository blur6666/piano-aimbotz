// Versioned catalog data: 3 progression groups, 12 physical major scales,
// 38 exercises: ascending + descending per scale at one octave (8 steps),
// plus the same at two octaves (15 steps) for Group 1 and F. Right
// hand only -- v1 scope per SPEC.md.
//
// Provenance: primary source is `fingering-reference-pianoscales-org.png`,
// a piano fingering table attributed to pianoscales.org -- SPEC.md's
// declared "fingering data source of record". Cross-checked against the
// independent `major-minor-scales-fingerings.tsv`. Group 1 (C, G, D, A, E,
// B) and Group 2 (F) fingerings are fixed by SPEC.md and match both
// sources exactly. Group 3 (black-key scales) required reconciling the
// two sources by hand; see the note on each scale below.

import type {
  Catalog,
  CatalogExercise,
  CatalogGroup,
  CatalogScale,
  CatalogStep
} from '../src/domain/catalog/index.js'

// A major scale's interval pattern (W-W-H-W-W-W-H) is identical in every
// key, so the ascending semitone offsets from the tonic never change --
// only note spellings and right-hand fingering vary per scale.
const ASCENDING_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const

// Two octaves repeat the same seven-degree cycle a twelfth higher, then close
// on the upper tonic: 0 2 4 5 7 9 11 | 12 14 16 17 19 21 23 | 24.
const TWO_OCTAVE_ASCENDING_OFFSETS = [
  ...ASCENDING_OFFSETS.slice(0, 7),
  ...ASCENDING_OFFSETS.slice(0, 7).map((offset) => offset + 12),
  24
] as const

// The seven scales whose two-octave fingering follows from data this catalog
// already documents. The five black-key scales are deliberately absent: their
// one-octave patterns do not start on the thumb, so the repeat below is not
// valid for them and no source here states their two-octave fingering.
const TWO_OCTAVE_SCALE_SLUGS = new Set([
  'c-major',
  'g-major',
  'd-major',
  'a-major',
  'e-major',
  'b-major',
  'f-major'
])

// Two octaves reuse the one-octave cycle: the first seven values repeat, then
// the original closing value ends the scale. Same discipline as the descending
// derivation below -- no new fingering data is invented, it is mechanically
// derived from the one-octave pattern. Verified against both patterns in
// scope:
//   Group 1 [1,2,3,1,2,3,4,5] -> 1 2 3 1 2 3 4 | 1 2 3 1 2 3 4 | 5
//   F major [1,2,3,4,1,2,3,4] -> 1 2 3 4 1 2 3 | 1 2 3 4 1 2 3 | 4
// The F result keeps the thumb on F and C throughout, which is the standard
// right hand for that scale.
function repeatCycle<T>(values: readonly T[]): T[] {
  const cycle = values.slice(0, 7)
  return [...cycle, ...cycle, values[7]]
}

// Descending is the exact reverse of ascending: notes, offsets (mirrored
// around the upper tonic), and fingering. Matches the precedent already
// set for C major descending (AGENTS.md: "Fingering is the reverse of
// known ascending; no new data needed") -- no new descending data is
// invented here, it is mechanically derived.
function buildOctaveExercises(
  def: ScaleDefinition,
  octaves: number
): CatalogExercise[] {
  const notes =
    octaves === 1 ? [...def.ascendingNotes] : repeatCycle(def.ascendingNotes)
  const fingering =
    octaves === 1
      ? [...def.ascendingFingering]
      : repeatCycle(def.ascendingFingering)
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
  const exercises = buildOctaveExercises(def, 1)
  if (TWO_OCTAVE_SCALE_SLUGS.has(def.slug))
    exercises.push(...buildOctaveExercises(def, 2))
  return exercises
}

type ScaleDefinition = {
  slug: string
  displayName: string
  tonicPitchClass: number
  positionInGroup: number
  ascendingNotes: readonly string[]
  ascendingFingering: readonly number[]
}

function buildScale(def: ScaleDefinition): CatalogScale {
  return {
    slug: def.slug,
    displayName: def.displayName,
    tonicPitchClass: def.tonicPitchClass,
    positionInGroup: def.positionInGroup,
    exercises: buildExercises(def)
  }
}

// Group 1 -- one shared right-hand pattern for six scales. Matches both
// sources exactly, and matches SPEC.md's explicit table.
const GROUP_1_SHARED_FINGERING = [1, 2, 3, 1, 2, 3, 4, 5] as const

const group1: CatalogGroup = {
  slug: 'group-1',
  name: 'Group 1 — shared fingering',
  progressionOrder: 1,
  scales: (
    [
      {
        slug: 'c-major',
        displayName: 'C major',
        tonicPitchClass: 0,
        positionInGroup: 1,
        ascendingNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
        ascendingFingering: GROUP_1_SHARED_FINGERING
      },
      {
        slug: 'g-major',
        displayName: 'G major',
        tonicPitchClass: 7,
        positionInGroup: 2,
        ascendingNotes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G'],
        ascendingFingering: GROUP_1_SHARED_FINGERING
      },
      {
        slug: 'd-major',
        displayName: 'D major',
        tonicPitchClass: 2,
        positionInGroup: 3,
        ascendingNotes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#', 'D'],
        ascendingFingering: GROUP_1_SHARED_FINGERING
      },
      {
        slug: 'a-major',
        displayName: 'A major',
        tonicPitchClass: 9,
        positionInGroup: 4,
        ascendingNotes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#', 'A'],
        ascendingFingering: GROUP_1_SHARED_FINGERING
      },
      {
        slug: 'e-major',
        displayName: 'E major',
        tonicPitchClass: 4,
        positionInGroup: 5,
        ascendingNotes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#', 'E'],
        ascendingFingering: GROUP_1_SHARED_FINGERING
      },
      {
        slug: 'b-major',
        displayName: 'B major',
        tonicPitchClass: 11,
        positionInGroup: 6,
        ascendingNotes: ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#', 'B'],
        ascendingFingering: GROUP_1_SHARED_FINGERING
      }
    ] satisfies ScaleDefinition[]
  ).map(buildScale)
}

// Group 2 -- the one white-key exception. Matches both sources exactly.
const group2: CatalogGroup = {
  slug: 'group-2',
  name: 'Group 2 — the white-key exception',
  progressionOrder: 2,
  scales: (
    [
      {
        slug: 'f-major',
        displayName: 'F major',
        tonicPitchClass: 5,
        positionInGroup: 1,
        ascendingNotes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E', 'F'],
        ascendingFingering: [1, 2, 3, 4, 1, 2, 3, 4]
      }
    ] satisfies ScaleDefinition[]
  ).map(buildScale)
}

// Group 3 -- five separate black-key fingerings (SPEC.md: "many shapes,
// all comfortable", not one shared pattern). Two independent sources were
// reconciled by hand; see the note on each scale.
const group3: CatalogGroup = {
  slug: 'group-3',
  name: 'Group 3 — black-key scales',
  progressionOrder: 3,
  scales: (
    [
      {
        // B-flat: pianoscales.org (the reference image) reads
        // 2-1-2-3-1-2-3-4. An independent source
        // (major-minor-scales-fingerings.tsv) and SPEC.md's original
        // prose both say B-flat starts on 4 (4-1-2-3-1-2-3-4) --
        // identical on every other digit. Decision: use the
        // pianoscales.org value.
        // Alternate (TSV / SPEC.md prose): [4, 1, 2, 3, 1, 2, 3, 4]
        slug: 'b-flat-major',
        displayName: 'B♭ major',
        tonicPitchClass: 10,
        positionInGroup: 1,
        ascendingNotes: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
        ascendingFingering: [2, 1, 2, 3, 1, 2, 3, 4]
      },
      {
        // E-flat: pianoscales.org (the reference image) reads
        // 2-1-2-3-4-1-2-3. The TSV and SPEC.md's original prose both say
        // E-flat starts on 3 (3-1-2-3-4-1-2-3) -- identical on every
        // other digit. Decision: use the pianoscales.org value.
        // Alternate (TSV / SPEC.md prose): [3, 1, 2, 3, 4, 1, 2, 3]
        slug: 'e-flat-major',
        displayName: 'E♭ major',
        tonicPitchClass: 3,
        positionInGroup: 2,
        ascendingNotes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb'],
        ascendingFingering: [2, 1, 2, 3, 4, 1, 2, 3]
      },
      {
        // A-flat: the two sources disagree with no SPEC.md tiebreaker --
        // pianoscales.org (the reference image) reads 2-3-1-2-3-1-2-3,
        // the TSV reads 3-4-1-2-3-1-2-3. Decision: use the TSV value.
        // Alternate (pianoscales.org): [2, 3, 1, 2, 3, 1, 2, 3]
        slug: 'a-flat-major',
        displayName: 'A♭ major',
        tonicPitchClass: 8,
        positionInGroup: 3,
        ascendingNotes: ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G', 'Ab'],
        ascendingFingering: [3, 4, 1, 2, 3, 1, 2, 3]
      },
      {
        // D-flat: both sources agree exactly (2-3-1-2-3-4-1-2), and it
        // matches SPEC.md's stated starting finger (2). No conflict.
        slug: 'd-flat-major',
        displayName: 'D♭ major',
        tonicPitchClass: 1,
        positionInGroup: 4,
        ascendingNotes: ['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C', 'Db'],
        ascendingFingering: [2, 3, 1, 2, 3, 4, 1, 2]
      },
      {
        // G-flat/F-sharp: one physical scale, per SPEC.md ("Fingering is
        // physical; the spelling difference is notational only"). Both
        // sources agree exactly (2-3-4-1-2-3-1-2).
        slug: 'f-sharp-g-flat-major',
        displayName: 'F♯ / G♭ major',
        tonicPitchClass: 6,
        positionInGroup: 5,
        ascendingNotes: ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F', 'Gb'],
        ascendingFingering: [2, 3, 4, 1, 2, 3, 1, 2]
      }
    ] satisfies ScaleDefinition[]
  ).map(buildScale)
}

export const catalogV1: Catalog = {
  version: 'v1',
  groups: [group1, group2, group3]
}
