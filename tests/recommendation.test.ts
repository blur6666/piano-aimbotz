import { describe, expect, it } from 'vitest'
import {
  isScaleCleared,
  recommendNextScale,
  type RecommendationConfig,
  type RecommendationScale
} from '../src/domain/progression/recommendation.js'

// Both one-octave directions must have advanced. This is the current guess
// from docs/SPEC.md, supplied explicitly so the tests state the rule they
// assert instead of inheriting a production constant.
const config: RecommendationConfig = {
  clearOctaves: 1,
  clearDirections: ['ascending', 'descending']
}

// `advanced` is the whole signal: current tempo above the immutable seeded
// initial tempo.
function scale(
  slug: string,
  advanced: { ascending: boolean; descending: boolean },
  { octaves = 1 }: { octaves?: number } = {}
): RecommendationScale {
  return {
    slug,
    exercises: (['ascending', 'descending'] as const).map((direction) => ({
      direction,
      octaves,
      initialTempoBpm: 60,
      currentTempoBpm: advanced[direction] ? 64 : 60
    }))
  }
}

describe('isScaleCleared', () => {
  it('clears only when every configured direction has advanced', () => {
    expect(
      isScaleCleared(scale('c', { ascending: true, descending: true }), config)
    ).toBe(true)
    expect(
      isScaleCleared(scale('c', { ascending: true, descending: false }), config)
    ).toBe(false)
    expect(
      isScaleCleared(scale('c', { ascending: false, descending: true }), config)
    ).toBe(false)
    expect(
      isScaleCleared(
        scale('c', { ascending: false, descending: false }),
        config
      )
    ).toBe(false)
  })

  it('does not clear on tempo equal to the initial tempo', () => {
    // A scale played many times without ever passing sits at its seeded
    // tempo. Equality is not advancement.
    const untouched: RecommendationScale = {
      slug: 'c',
      exercises: [
        {
          direction: 'ascending',
          octaves: 1,
          initialTempoBpm: 60,
          currentTempoBpm: 60
        },
        {
          direction: 'descending',
          octaves: 1,
          initialTempoBpm: 60,
          currentTempoBpm: 60
        }
      ]
    }
    expect(isScaleCleared(untouched, config)).toBe(false)
  })

  it('ignores octave counts other than the configured one', () => {
    // Two-octave variants are playable but never gate (docs/SPEC.md), so a
    // fully advanced two-octave pair leaves the scale uncleared.
    const twoOctaveOnly = scale(
      'c',
      { ascending: true, descending: true },
      { octaves: 2 }
    )
    expect(isScaleCleared(twoOctaveOnly, config)).toBe(false)
  })

  it('honours a configuration that gates on ascending alone', () => {
    const ascendingOnly: RecommendationConfig = {
      clearOctaves: 1,
      clearDirections: ['ascending']
    }
    expect(
      isScaleCleared(
        scale('c', { ascending: true, descending: false }),
        ascendingOnly
      )
    ).toBe(true)
  })

  it('treats a missing gating exercise as uncleared, not as cleared', () => {
    // Vacuous truth would be the dangerous default here: a catalog gap would
    // silently mark the scale done.
    const noDescending: RecommendationScale = {
      slug: 'c',
      exercises: [
        {
          direction: 'ascending',
          octaves: 1,
          initialTempoBpm: 60,
          currentTempoBpm: 64
        }
      ]
    }
    expect(isScaleCleared(noDescending, config)).toBe(false)
  })
})

describe('recommendNextScale', () => {
  it('returns the first uncleared scale in the given order', () => {
    const slug = recommendNextScale(
      [
        scale('c', { ascending: true, descending: true }),
        scale('g', { ascending: true, descending: false }),
        scale('d', { ascending: false, descending: false })
      ],
      config
    )
    expect(slug).toBe('g')
  })

  it('respects the supplied order rather than re-sorting', () => {
    // The ordering is the recommendation, and it arrives already sorted by
    // group and position. A later-but-uncleared scale must not jump the queue.
    const slug = recommendNextScale(
      [
        scale('d', { ascending: false, descending: false }),
        scale('c', { ascending: false, descending: false })
      ],
      config
    )
    expect(slug).toBe('d')
  })

  it('returns null when every scale is cleared', () => {
    const slug = recommendNextScale(
      [
        scale('c', { ascending: true, descending: true }),
        scale('g', { ascending: true, descending: true })
      ],
      config
    )
    expect(slug).toBeNull()
  })

  it('returns null for an empty catalog rather than throwing', () => {
    expect(recommendNextScale([], config)).toBeNull()
  })
})
