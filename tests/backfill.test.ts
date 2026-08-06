import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
import {
  backfillMissingAssessments,
  LEGACY_BACKFILL_ALGORITHM_VERSION
} from '../src/server/db/backfill-assessments.js'
import { buildApp } from '../src/server/app.js'
import type { AppConfig } from '../src/server/config.js'

const testConfig: AppConfig = {
  scoring: {
    timingToleranceNoteFraction: 1_000,
    overlapToleranceUs: Number.MAX_SAFE_INTEGER,
    maxTimingFaultsPerRun: Number.MAX_SAFE_INTEGER,
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

function seedAndOpenCMajorAscending(sqlite: Database.Database): number {
  applyMigrations(sqlite)
  seedCatalog(sqlite, testConfig)
  return (
    sqlite
      .prepare(
        `SELECT e.id FROM exercises e
         JOIN scales s ON s.id = e.scale_id
         WHERE s.slug = 'c-major' AND e.direction = 'ascending'`
      )
      .get() as { id: number }
  ).id
}

// Simulates a run captured by Stage 1, before run_assessments existed: a
// runs row and its raw midi_events, but no assessment row at all.
function insertLegacyRun(sqlite: Database.Database, exerciseId: number) {
  sqlite
    .prepare(
      'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, ?, 1000, 60)'
    )
    .run(exerciseId)
  const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
  const insertEvent = sqlite.prepare(
    'INSERT INTO midi_events (run_id, sequence_number, offset_us, event_type, midi_pitch, velocity) VALUES (1, ?, ?, ?, ?, ?)'
  )
  cMajor.forEach((midiPitch, index) =>
    insertEvent.run(index, index * 1_000_000, 'note_on', midiPitch, 100)
  )
}

describe('backfillMissingAssessments', () => {
  it('creates a marked assessment for a run with none and rebuilds progress', () => {
    const sqlite = new Database(':memory:')
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    insertLegacyRun(sqlite, exerciseId)

    const backfilled = backfillMissingAssessments(sqlite, testConfig)
    expect(backfilled).toEqual([1])

    const assessment = sqlite
      .prepare('SELECT * FROM run_assessments WHERE run_id = 1')
      .get() as {
      algorithm_version: string
      hard_fault_count: number
      passed: number
    }
    expect(assessment.algorithm_version).toBe(LEGACY_BACKFILL_ALGORITHM_VERSION)
    expect(assessment.hard_fault_count).toBe(0)
    expect(assessment.passed).toBe(1)

    const progress = sqlite
      .prepare(
        'SELECT consecutive_clean_runs FROM exercise_progress WHERE exercise_id = ?'
      )
      .get(exerciseId) as { consecutive_clean_runs: number }
    expect(progress.consecutive_clean_runs).toBe(1)

    sqlite.close()
  })

  it('is idempotent: a second pass does not duplicate or error', () => {
    const sqlite = new Database(':memory:')
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    insertLegacyRun(sqlite, exerciseId)

    backfillMissingAssessments(sqlite, testConfig)
    const second = backfillMissingAssessments(sqlite, testConfig)
    expect(second).toEqual([])

    const count = sqlite
      .prepare('SELECT count(*) AS count FROM run_assessments')
      .get() as { count: number }
    expect(count.count).toBe(1)

    sqlite.close()
  })

  it('leaves runs that already have an assessment untouched', () => {
    const sqlite = new Database(':memory:')
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    insertLegacyRun(sqlite, exerciseId)
    sqlite
      .prepare(
        `INSERT INTO run_assessments (run_id, algorithm_version, scoring_parameters, progression_policy_version, progression_parameters, hard_fault_count, timing_fault_count, overlap_fault_count, timing_sample_count, timing_excluded_count, mean_absolute_timing_deviation_us, passed, assessed_at_ms)
         VALUES (1, 'stage2', '{}', 'v1', '{}', 0, 0, 0, 8, 0, 0, 1, 123)`
      )
      .run()

    const backfilled = backfillMissingAssessments(sqlite, testConfig)
    expect(backfilled).toEqual([])

    const assessment = sqlite
      .prepare('SELECT algorithm_version FROM run_assessments WHERE run_id = 1')
      .get() as { algorithm_version: string }
    expect(assessment.algorithm_version).toBe('stage2')

    sqlite.close()
  })

  it('a backfilled legacy run is now visible through the run history and detail APIs', async () => {
    const sqlite = new Database(':memory:')
    const exerciseId = seedAndOpenCMajorAscending(sqlite)
    insertLegacyRun(sqlite, exerciseId)
    backfillMissingAssessments(sqlite, testConfig)

    const app = buildApp(sqlite, testConfig)
    const history = await app.inject({
      method: 'GET',
      url: `/api/runs?exerciseId=${exerciseId}`
    })
    expect(history.statusCode).toBe(200)
    expect(history.json().runs).toHaveLength(1)

    const detail = await app.inject({ method: 'GET', url: '/api/runs/1' })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().originalAssessment.algorithmVersion).toBe(
      LEGACY_BACKFILL_ALGORITHM_VERSION
    )
    await app.close()
  })
})
