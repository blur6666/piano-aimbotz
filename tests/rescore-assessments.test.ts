import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { applyMigrations } from '../src/server/db/apply-migrations.js'
import { seedCatalog } from '../src/server/db/seed.js'
import type { AppConfig } from '../src/server/config.js'
import { createRun } from '../src/server/runs/create-run.js'
import { rescoreAssessments } from '../src/server/db/rescore-assessments.js'

const config: AppConfig = {
  scoring: {
    timingToleranceNoteFraction: 0.01,
    overlapToleranceUs: Number.MAX_SAFE_INTEGER,
    maxTimingFaultsPerRun: 0,
    recoveryWindowSteps: 1
  },
  progression: {
    cleanRunsRequired: 3,
    tempoIncrementBpm: 4,
    failedRunBehavior: 'reset_streak'
  },
  recommendation: {
    clearOctaves: 1,
    clearDirections: ['ascending', 'descending']
  },
  seedInitialTempoBpm: 60,
  notesPerBeat: 1
}

describe('rescoreAssessments', () => {
  it('replaces stored timing assessments and rebuilds progress from them', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    seedCatalog(sqlite, config)
    const exerciseId = (
      sqlite
        .prepare(
          `SELECT e.id FROM exercises e
           JOIN scales s ON s.id = e.scale_id
           WHERE s.slug = 'c-major' AND e.direction = 'ascending' AND e.octaves = 1`
        )
        .get() as { id: number }
    ).id
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 72]
    createRun(sqlite, config, {
      exerciseId,
      firstExpectedBeatAtMs: 1000,
      tempoBpm: 60,
      events: cMajor.map((midiPitch, index) => ({
        sequenceNumber: index,
        offsetUs: 80_000 + index * 1_020_000,
        type: 'note_on' as const,
        midiPitch,
        velocity: 100
      }))
    })
    sqlite
      .prepare(
        "UPDATE run_assessments SET algorithm_version = 'stage2', assessed_at_ms = 12345"
      )
      .run()

    expect(rescoreAssessments(sqlite, config)).toEqual([1])
    expect(
      sqlite
        .prepare(
          'SELECT algorithm_version, timing_fault_count, timing_start_offset_us, passed FROM run_assessments WHERE run_id = 1'
        )
        .get()
    ).toEqual({
      algorithm_version: 'stage3-best-fit-line',
      timing_fault_count: 0,
      timing_start_offset_us: 80_000,
      passed: 1
    })
    expect(
      sqlite
        .prepare('SELECT assessed_at_ms FROM run_assessments WHERE run_id = 1')
        .get()
    ).toEqual({ assessed_at_ms: 12345 })
    expect(
      sqlite
        .prepare(
          'SELECT consecutive_clean_runs FROM exercise_progress WHERE exercise_id = ?'
        )
        .get(exerciseId)
    ).toEqual({ consecutive_clean_runs: 1 })
    sqlite.close()
  })
})
