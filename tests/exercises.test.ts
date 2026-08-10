import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
import { buildApp } from '../src/server/app.js'
import type { AppConfig } from '../src/server/config.js'

const testConfig: AppConfig = {
  scoring: {
    timingToleranceNoteFraction: 0.05,
    overlapToleranceUs: 30_000,
    maxTimingFaultsPerRun: 0,
    recoveryWindowSteps: 1
  },
  progression: {
    cleanRunsRequired: 3,
    tempoIncrementBpm: 4,
    failedRunBehavior: 'reset_streak'
  },
  seedInitialTempoBpm: 60,
  notesPerBeat: 1
}

describe('GET /api/exercises', () => {
  it('returns the full 3-group/12-scale/38-exercise catalog in progression order', async () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, testConfig)

    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({ method: 'GET', url: '/api/exercises' })
    expect(response.statusCode).toBe(200)
    const body = response.json()

    expect(
      body.groups.map(
        (group: {
          slug: string
          progressionOrder: number
          scales: unknown[]
        }) => ({
          slug: group.slug,
          progressionOrder: group.progressionOrder,
          scaleCount: group.scales.length
        })
      )
    ).toEqual([
      { slug: 'group-1', progressionOrder: 1, scaleCount: 6 },
      { slug: 'group-2', progressionOrder: 2, scaleCount: 1 },
      { slug: 'group-3', progressionOrder: 3, scaleCount: 5 }
    ])

    const totalExercises = body.groups.reduce(
      (sum: number, group: { scales: Array<{ exercises: unknown[] }> }) =>
        sum +
        group.scales.reduce(
          (scaleSum: number, scale: { exercises: unknown[] }) =>
            scaleSum + scale.exercises.length,
          0
        ),
      0
    )
    expect(totalExercises).toBe(38)

    expect(body.groups[0].scales[0]).toMatchObject({
      slug: 'c-major',
      displayName: 'C major',
      positionInGroup: 1
    })
    expect(
      body.groups[0].scales[0].exercises.map(
        (exercise: { id: number; direction: string; octaves: number }) =>
          `${exercise.direction} ${exercise.octaves}-octave`
      )
    ).toEqual([
      'ascending 1-octave',
      'descending 1-octave',
      'ascending 2-octave',
      'descending 2-octave'
    ])

    // Every exercise starts at the configured seed tempo and has the
    // expected number of steps for its octave count.
    for (const group of body.groups)
      for (const scale of group.scales)
        for (const exercise of scale.exercises) {
          expect(exercise.currentTempoBpm).toBe(60)
          expect(exercise.consecutiveCleanRuns).toBe(0)
          expect(exercise.steps).toHaveLength(exercise.octaves * 7 + 1)
        }

    // Spot-check the resolved A-flat fingering from
    // docs/SCALES_FINGERING_REFERENCE.md made it through seed -> route ->
    // response intact.
    const group3 = body.groups[2]
    const aFlat = group3.scales.find(
      (scale: { slug: string }) => scale.slug === 'a-flat-major'
    )
    const aFlatAscending = aFlat.exercises.find(
      (exercise: { direction: string }) => exercise.direction === 'ascending'
    )
    expect(
      aFlatAscending.steps.map(
        (step: { fingerNumber: number }) => step.fingerNumber
      )
    ).toEqual([3, 4, 1, 2, 3, 1, 2, 3])

    // E-flat starts on finger 3 per the same reference (the one scale whose
    // fingering the reference changed).
    const eFlat = group3.scales.find(
      (scale: { slug: string }) => scale.slug === 'e-flat-major'
    )
    const eFlatAscending = eFlat.exercises.find(
      (exercise: { direction: string }) => exercise.direction === 'ascending'
    )
    expect(
      eFlatAscending.steps.map(
        (step: { fingerNumber: number }) => step.fingerNumber
      )
    ).toEqual([3, 1, 2, 3, 4, 1, 2, 3])

    await app.close()
    sqlite.close()
  })

  it('returns 503 before the catalog is seeded', async () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)

    const app = buildApp(sqlite, testConfig)
    const response = await app.inject({ method: 'GET', url: '/api/exercises' })
    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('not_seeded')

    await app.close()
    sqlite.close()
  })
})
