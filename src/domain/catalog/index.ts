// Validates the complete seeded catalog and its provenance
// (ARCHITECTURE.md, "Module ownership"). Pure: no Fastify, no database, no
// filesystem. The catalog data file (catalog/v1.ts) owns the types this
// module validates against, so this module is the single source of truth
// for "what shape must catalog data be."

export type CatalogStep = readonly [
  noteSpelling: string,
  semitoneOffset: number,
  fingerNumber: number
]

export type CatalogExercise = {
  direction: 'ascending' | 'descending'
  // 1 or 2. A two-octave exercise has 15 steps spanning 24 semitones.
  octaves: number
  steps: readonly CatalogStep[]
}

export type CatalogScale = {
  slug: string
  displayName: string
  tonicPitchClass: number
  positionInGroup: number
  exercises: readonly CatalogExercise[]
}

export type CatalogGroup = {
  slug: string
  name: string
  progressionOrder: number
  scales: readonly CatalogScale[]
}

export type Catalog = {
  version: string
  groups: readonly CatalogGroup[]
}

// SPEC.md's three fingering groups, in progression order, with the scale
// count each must contain (Group 1: C, G, D, A, E, B; Group 2: F; Group 3:
// the five black-key scales).
const EXPECTED_GROUPS = [
  {
    slug: 'group-1',
    name: 'Group 1 — shared fingering',
    progressionOrder: 1,
    scaleCount: 6
  },
  {
    slug: 'group-2',
    name: 'Group 2 — the white-key exception',
    progressionOrder: 2,
    scaleCount: 1
  },
  {
    slug: 'group-3',
    name: 'Group 3 — black-key scales',
    progressionOrder: 3,
    scaleCount: 5
  }
] as const

// Enharmonic-aware pitch-class lookup for the spellings this catalog
// actually uses (naturals, single sharps, single flats, plus Cb for
// G-flat/F-sharp's fourth degree). Used to cross-check that every step's
// note spelling agrees with its stored semitone offset.
const PITCH_CLASS_BY_SPELLING: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12
}

export function validateCatalog(catalog: Catalog): void {
  if (catalog.groups.length !== EXPECTED_GROUPS.length)
    throw new Error(
      `Catalog must have exactly ${EXPECTED_GROUPS.length} progression groups, found ${catalog.groups.length}.`
    )

  const groupsByOrder = [...catalog.groups].sort(
    (a, b) => a.progressionOrder - b.progressionOrder
  )
  const seenTonicPitchClasses = new Set<number>()
  const seenScaleSlugs = new Set<string>()
  const seenScaleDisplayNames = new Set<string>()
  const allScales: CatalogScale[] = []

  // First pass: catalog-wide structural checks (group shape, position
  // ordering, cross-scale uniqueness). These are cheaper and more
  // fundamental than per-exercise content, so they surface first instead
  // of being masked by a step-level error on the first offending scale.
  EXPECTED_GROUPS.forEach((expected, index) => {
    const group = groupsByOrder[index]
    if (
      group.progressionOrder !== expected.progressionOrder ||
      group.slug !== expected.slug ||
      group.name !== expected.name
    )
      throw new Error(
        `Catalog group at progression order ${expected.progressionOrder} must be ` +
          `(slug="${expected.slug}", name="${expected.name}"), found ` +
          `(slug="${group.slug}", name="${group.name}", progressionOrder=${group.progressionOrder}).`
      )
    if (group.scales.length !== expected.scaleCount)
      throw new Error(
        `Catalog group "${group.slug}" must have exactly ${expected.scaleCount} scales, found ${group.scales.length}.`
      )

    const positions = [...group.scales]
      .map((scale) => scale.positionInGroup)
      .sort((a, b) => a - b)
    positions.forEach((position, positionIndex) => {
      if (position !== positionIndex + 1)
        throw new Error(
          `Catalog group "${group.slug}" must have positionInGroup values 1..${expected.scaleCount} with no gaps or duplicates, found [${positions.join(', ')}].`
        )
    })

    for (const scale of group.scales) {
      allScales.push(scale)
      if (scale.tonicPitchClass < 0 || scale.tonicPitchClass > 11)
        throw new Error(
          `Scale "${scale.slug}" has tonicPitchClass ${scale.tonicPitchClass}, outside 0..11.`
        )
      if (seenTonicPitchClasses.has(scale.tonicPitchClass))
        throw new Error(
          `Scale "${scale.slug}" duplicates tonicPitchClass ${scale.tonicPitchClass} already used by another scale in the catalog.`
        )
      seenTonicPitchClasses.add(scale.tonicPitchClass)

      if (seenScaleSlugs.has(scale.slug))
        throw new Error(`Duplicate scale slug "${scale.slug}" in catalog.`)
      seenScaleSlugs.add(scale.slug)

      if (seenScaleDisplayNames.has(scale.displayName))
        throw new Error(
          `Duplicate scale displayName "${scale.displayName}" in catalog.`
        )
      seenScaleDisplayNames.add(scale.displayName)
    }
  })

  if (allScales.length !== 12)
    throw new Error(
      `Catalog must define exactly the twelve physical scales, found ${allScales.length}.`
    )
  if (seenTonicPitchClasses.size !== 12)
    throw new Error(
      `Catalog must cover every tonic pitch class 0..11 exactly once, found [${[...seenTonicPitchClasses].sort((a, b) => a - b).join(', ')}].`
    )

  // Two-octave coverage is deliberately partial (Group 1 plus F). Asserting
  // the exact count means a half-applied catalog change fails loudly here
  // rather than surfacing as a missing exercise in the picker.
  const twoOctaveScaleCount = allScales.filter((scale) =>
    scale.exercises.some((exercise) => exercise.octaves === 2)
  ).length
  if (twoOctaveScaleCount !== 7)
    throw new Error(
      `Catalog must define two-octave exercises for exactly 7 scales (Group 1 plus F), found ${twoOctaveScaleCount}.`
    )

  // Second pass: per-scale exercise/step content, once the catalog's own
  // shape is known to be sound.
  for (const scale of allScales) validateScaleExercises(scale)
}

function validateScaleExercises(scale: CatalogScale): void {
  const byOctaves = new Map<number, CatalogExercise[]>()
  for (const exercise of scale.exercises) {
    if (exercise.octaves !== 1 && exercise.octaves !== 2)
      throw new Error(
        `Scale "${scale.slug}" has an exercise with octaves ${exercise.octaves}, expected 1 or 2.`
      )
    const list = byOctaves.get(exercise.octaves) ?? []
    list.push(exercise)
    byOctaves.set(exercise.octaves, list)
  }

  if (!byOctaves.has(1))
    throw new Error(
      `Scale "${scale.slug}" must have one-octave exercises; found only [${[...byOctaves.keys()].join(', ')}].`
    )

  // Every octave count a scale offers must be a complete ascending/descending
  // pair, and the mirror-fingering rule holds within that pair rather than
  // across the scale as a whole.
  for (const [octaves, exercises] of byOctaves) {
    if (exercises.length !== 2)
      throw new Error(
        `Scale "${scale.slug}" must have exactly 2 ${octaves}-octave exercises (ascending and descending), found ${exercises.length}.`
      )
    const ascending = exercises.find(
      (exercise) => exercise.direction === 'ascending'
    )
    const descending = exercises.find(
      (exercise) => exercise.direction === 'descending'
    )
    if (!ascending || !descending)
      throw new Error(
        `Scale "${scale.slug}" must have exactly one ascending and one descending ${octaves}-octave exercise, found directions [${exercises.map((exercise) => exercise.direction).join(', ')}].`
      )

    validateSteps(scale, ascending)
    validateSteps(scale, descending)

    const ascendingFingering = ascending.steps.map(
      ([, , fingerNumber]) => fingerNumber
    )
    const descendingFingering = descending.steps.map(
      ([, , fingerNumber]) => fingerNumber
    )
    const reversedAscendingFingering = [...ascendingFingering].reverse()
    if (
      descendingFingering.some(
        (finger, index) => finger !== reversedAscendingFingering[index]
      )
    )
      throw new Error(
        `Scale "${scale.slug}" ${octaves}-octave descending fingering [${descendingFingering.join(', ')}] must be the exact reverse of ascending [${ascendingFingering.join(', ')}].`
      )
  }
}

function validateSteps(scale: CatalogScale, exercise: CatalogExercise): void {
  const label = `${scale.slug} ${exercise.direction} ${exercise.octaves}-octave`
  // Seven degrees per octave plus the closing tonic: 8 steps for one octave,
  // 15 for two.
  const expectedStepCount = exercise.octaves * 7 + 1
  if (exercise.steps.length !== expectedStepCount)
    throw new Error(
      `Exercise "${label}" must have exactly ${expectedStepCount} steps, found ${exercise.steps.length}.`
    )

  const [, firstOffset] = exercise.steps[0]
  if (firstOffset !== 0)
    throw new Error(
      `Exercise "${label}" step 0 must have semitoneOffset 0, found ${firstOffset}.`
    )

  const lastIndex = expectedStepCount - 1
  const [, lastOffset] = exercise.steps[lastIndex]
  const expectedLastOffset =
    (exercise.direction === 'ascending' ? 12 : -12) * exercise.octaves
  if (lastOffset !== expectedLastOffset)
    throw new Error(
      `Exercise "${label}" step ${lastIndex} must have semitoneOffset ${expectedLastOffset}, found ${lastOffset}.`
    )

  for (let index = 0; index < exercise.steps.length; index += 1) {
    const [noteSpelling, offset, fingerNumber] = exercise.steps[index]

    if (fingerNumber < 1 || fingerNumber > 5)
      throw new Error(
        `Exercise "${label}" step ${index} has fingerNumber ${fingerNumber}, outside 1..5.`
      )

    const expectedPitchClass = PITCH_CLASS_BY_SPELLING[noteSpelling]
    if (expectedPitchClass === undefined)
      throw new Error(
        `Exercise "${label}" step ${index} has unrecognized note spelling "${noteSpelling}".`
      )
    if (mod12(scale.tonicPitchClass + offset) !== expectedPitchClass)
      throw new Error(
        `Exercise "${label}" step ${index}: note spelling "${noteSpelling}" (pitch class ${expectedPitchClass}) ` +
          `does not match tonicPitchClass ${scale.tonicPitchClass} + semitoneOffset ${offset}.`
      )

    if (index > 0) {
      const [, previousOffset] = exercise.steps[index - 1]
      const strictlyOrdered =
        exercise.direction === 'ascending'
          ? offset > previousOffset
          : offset < previousOffset
      if (!strictlyOrdered)
        throw new Error(
          `Exercise "${label}" offsets must be strictly ${exercise.direction === 'ascending' ? 'increasing' : 'decreasing'}; step ${index} (${offset}) violates that against step ${index - 1} (${previousOffset}).`
        )
    }
  }
}
