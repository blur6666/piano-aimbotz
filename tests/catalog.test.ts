import { describe, expect, it } from 'vitest'
import { catalogV1 } from '../catalog/v1.js'
import { validateCatalog } from '../src/domain/catalog/index.js'

// Mutable mirrors of the real (readonly) catalog types: these tests
// deliberately mutate fields to construct malformed data.
type MutableStep = [
  noteSpelling: string,
  semitoneOffset: number,
  fingerNumber: number
]
type MutableExercise = {
  direction: 'ascending' | 'descending'
  octaves: number
  steps: MutableStep[]
}
type MutableScale = {
  slug: string
  displayName: string
  tonicPitchClass: number
  positionInGroup: number
  exercises: MutableExercise[]
}
type MutableGroup = {
  slug: string
  name: string
  progressionOrder: number
  scales: MutableScale[]
}
type MutableCatalog = { version: string; groups: MutableGroup[] }

// Deep-cloned, mutable copy of the real catalog for negative-case tests.
// Plain data (no functions), so a JSON round trip is a safe deep clone.
function cloneCatalog(): MutableCatalog {
  return JSON.parse(JSON.stringify(catalogV1))
}

describe('validateCatalog', () => {
  it('accepts the real seeded catalog', () => {
    expect(() => validateCatalog(catalogV1)).not.toThrow()
  })

  it('rejects a catalog without exactly 3 progression groups', () => {
    const catalog = cloneCatalog()
    catalog.groups = catalog.groups.slice(0, 2)
    expect(() => validateCatalog(catalog)).toThrow(
      /exactly 3 progression groups/
    )
  })

  it('rejects a group with the wrong scale count', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales.pop()
    expect(() => validateCatalog(catalog)).toThrow(
      /group-1" must have exactly 6 scales, found 5/
    )
  })

  it('rejects a duplicated tonic pitch class across scales', () => {
    const catalog = cloneCatalog()
    // c-major and g-major both end up at tonicPitchClass 7.
    catalog.groups[0].scales[0].tonicPitchClass = 7
    expect(() => validateCatalog(catalog)).toThrow(/duplicates tonicPitchClass/)
  })

  it('rejects gaps or duplicates in positionInGroup', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].positionInGroup = 2
    expect(() => validateCatalog(catalog)).toThrow(
      /positionInGroup values 1\.\.6 with no gaps or duplicates/
    )
  })

  it('rejects an exercise without exactly 8 steps', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].exercises[0].steps.pop()
    expect(() => validateCatalog(catalog)).toThrow(
      /must have exactly 8 steps, found 7/
    )
  })

  it('rejects a two-octave exercise without exactly 15 steps', () => {
    const catalog = cloneCatalog()
    const twoOctave = catalog.groups[0].scales[0].exercises.find(
      (exercise) => exercise.octaves === 2
    )!
    twoOctave.steps.pop()
    expect(() => validateCatalog(catalog)).toThrow(
      /must have exactly 15 steps, found 14/
    )
  })

  it('rejects a step-0 offset that is not zero', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].exercises[0].steps[0][1] = 1
    expect(() => validateCatalog(catalog)).toThrow(
      /step 0 must have semitoneOffset 0/
    )
  })

  it('rejects an ascending exercise whose step 7 offset is not 12', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].exercises[0].steps[7][1] = 11
    expect(() => validateCatalog(catalog)).toThrow(
      /step 7 must have semitoneOffset 12/
    )
  })

  it('rejects offsets that are not strictly increasing for ascending', () => {
    const catalog = cloneCatalog()
    // Swap steps 2 and 3 so the offsets go out of order.
    const steps = catalog.groups[0].scales[0].exercises[0].steps
    ;[steps[2], steps[3]] = [steps[3], steps[2]]
    expect(() => validateCatalog(catalog)).toThrow(
      /offsets must be strictly increasing/
    )
  })

  it('rejects a finger number outside 1..5', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].exercises[0].steps[1][2] = 6
    expect(() => validateCatalog(catalog)).toThrow(/outside 1\.\.5/)
  })

  it('rejects a note spelling that does not match its stored offset', () => {
    const catalog = cloneCatalog()
    // Step 1 of C major ascending is D (offset 2); relabel it E.
    catalog.groups[0].scales[0].exercises[0].steps[1][0] = 'E'
    expect(() => validateCatalog(catalog)).toThrow(
      /does not match tonicPitchClass/
    )
  })

  it('rejects an unrecognized note spelling', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].exercises[0].steps[1][0] = 'H'
    expect(() => validateCatalog(catalog)).toThrow(
      /unrecognized note spelling "H"/
    )
  })

  it('rejects descending fingering that is not the exact reverse of ascending', () => {
    const catalog = cloneCatalog()
    const descending = catalog.groups[0].scales[0].exercises.find(
      (exercise) => exercise.direction === 'descending'
    )!
    descending.steps[0][2] = 1
    expect(() => validateCatalog(catalog)).toThrow(
      /descending fingering .* must be the exact reverse of ascending/
    )
  })

  it('rejects a scale missing one of its two exercises', () => {
    const catalog = cloneCatalog()
    catalog.groups[0].scales[0].exercises.pop()
    expect(() => validateCatalog(catalog)).toThrow(
      /must have exactly 2 2-octave exercises/
    )
  })
})

describe('catalogV1 two-octave exercises', () => {
  function scaleBySlug(slug: string) {
    return catalogV1.groups
      .flatMap((group) => group.scales)
      .find((scale) => scale.slug === slug)!
  }

  function twoOctaveAscending(slug: string) {
    return scaleBySlug(slug).exercises.find(
      (exercise) =>
        exercise.octaves === 2 && exercise.direction === 'ascending'
    )!
  }

  it('builds C major two-octave ascending with the shared pattern repeated', () => {
    const exercise = twoOctaveAscending('c-major')
    expect(exercise.steps.map((step) => step[2])).toEqual([
      1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 5
    ])
    expect(exercise.steps.map((step) => step[1])).toEqual([
      0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24
    ])
    expect(exercise.steps.map((step) => step[0]).join(' ')).toBe(
      'C D E F G A B C D E F G A B C'
    )
  })

  it('builds F major two-octave ascending keeping the thumb on F and C', () => {
    const exercise = twoOctaveAscending('f-major')
    expect(exercise.steps.map((step) => step[2])).toEqual([
      1, 2, 3, 4, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 4
    ])
  })

  it('contains exactly 38 exercises, with only the seven two-octave scales offering a variant', () => {
    const allExercises = catalogV1.groups.flatMap((group) =>
      group.scales.flatMap((scale) => scale.exercises)
    )
    expect(allExercises).toHaveLength(38)

    const blackKeySlugs = [
      'b-flat-major',
      'e-flat-major',
      'a-flat-major',
      'd-flat-major',
      'f-sharp-g-flat-major'
    ]
    for (const scale of catalogV1.groups.flatMap((group) => group.scales)) {
      const hasTwoOctave = scale.exercises.some(
        (exercise) => exercise.octaves === 2
      )
      expect(hasTwoOctave).toBe(!blackKeySlugs.includes(scale.slug))
    }
  })
})
