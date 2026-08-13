import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { MIGRATION_FILES } from '../src/server/db/migration-files.js'
import { applyMigrations } from '../src/server/db/apply-migrations.js'

function readMigration(filename: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'migrations', filename),
    'utf8'
  )
}

describe('applyMigrations', () => {
  it('applies every migration file to an empty database', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'progression_groups',
        'scales',
        'exercises',
        'exercise_steps',
        'runs',
        'midi_events',
        'run_assessments',
        'exercise_progress'
      ])
    )
    sqlite.close()
  })

  it('is idempotent: re-applying after a non-idempotent ALTER migration does not error', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    expect(() => applyMigrations(sqlite)).not.toThrow()
    const applied = sqlite
      .prepare('SELECT filename FROM schema_migrations')
      .all() as { filename: string }[]
    expect(applied.map((row) => row.filename).sort()).toEqual(
      [...MIGRATION_FILES].sort()
    )
    sqlite.close()
  })

  it('every listed migration file exists on disk', () => {
    for (const filename of MIGRATION_FILES)
      expect(
        fs.existsSync(path.join(process.cwd(), 'migrations', filename))
      ).toBe(true)
  })

  it('migration 0006 seeds the group-1/c-major scale that pre-existing exercises rely on', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    expect(
      sqlite
        .prepare('SELECT slug, name, progression_order FROM progression_groups')
        .all()
    ).toEqual([
      {
        slug: 'group-1',
        name: 'Group 1 — shared fingering',
        progression_order: 1
      }
    ])
    expect(
      sqlite
        .prepare(
          'SELECT slug, display_name, tonic_pitch_class, position_in_group FROM scales'
        )
        .all()
    ).toEqual([
      {
        slug: 'c-major',
        display_name: 'C major',
        tonic_pitch_class: 0,
        position_in_group: 1
      }
    ])
    sqlite.close()
  })

  it('migration 0006 rebuilds exercises onto scale_id, preserving ids and fixture data across the table rebuild', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')

    const priorFiles = MIGRATION_FILES.slice(
      0,
      MIGRATION_FILES.indexOf('0006_progression_catalog.sql')
    )
    for (const filename of priorFiles) sqlite.exec(readMigration(filename))

    sqlite
      .prepare(
        "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (1, 'c-major-ascending', 'C major ascending', 'ascending', 0)"
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO exercises (id, slug, name, direction, tonic_pitch_class) VALUES (2, 'c-major-descending', 'C major descending', 'descending', 0)"
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 0, 'C', 0, 1)"
      )
      .run()
    sqlite.prepare('INSERT INTO exercise_progress VALUES (1, 60, 60, 0)').run()
    sqlite
      .prepare(
        'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, 1, 1000, 60)'
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO midi_events (run_id, sequence_number, offset_us, event_type, midi_pitch, velocity) VALUES (1, 0, 0, 'note_on', 60, 100)"
      )
      .run()

    sqlite.pragma('foreign_keys = OFF')
    sqlite.exec(readMigration('0006_progression_catalog.sql'))
    sqlite.pragma('foreign_keys = ON')

    const scale = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }
    expect(
      sqlite
        .prepare('SELECT id, scale_id, direction FROM exercises ORDER BY id')
        .all()
    ).toEqual([
      { id: 1, scale_id: scale.id, direction: 'ascending' },
      { id: 2, scale_id: scale.id, direction: 'descending' }
    ])
    expect(
      sqlite.prepare('SELECT exercise_id, step_index FROM exercise_steps').all()
    ).toEqual([{ exercise_id: 1, step_index: 0 }])
    expect(sqlite.prepare('SELECT id FROM runs').all()).toEqual([{ id: 1 }])
    expect(sqlite.pragma('foreign_key_check')).toEqual([])

    sqlite.close()
  })

  it('migration 0007 backfills existing runs as one note per beat and rejects an unsupported grid', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = OFF')

    const target = '0007_runs_notes_per_beat.sql'
    for (const filename of MIGRATION_FILES.slice(
      0,
      MIGRATION_FILES.indexOf(target)
    ))
      sqlite.exec(readMigration(filename))

    // A run recorded before the grid was configurable: it was played one
    // note per beat, and re-scoring it later must keep reading it that way.
    sqlite
      .prepare(
        'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, 1, 1000, 60)'
      )
      .run()

    sqlite.exec(readMigration(target))

    expect(sqlite.prepare('SELECT id, notes_per_beat FROM runs').all()).toEqual(
      [{ id: 1, notes_per_beat: 1 }]
    )

    sqlite
      .prepare(
        'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm, notes_per_beat) VALUES (2, 1, 2000, 80, 2)'
      )
      .run()
    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm, notes_per_beat) VALUES (3, 1, 3000, 80, 3)'
        )
        .run()
    ).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })

  it('migration 0008 backfills existing exercises as one octave and widens the step and assessment bounds', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = OFF')

    const target = '0008_two_octave_exercises.sql'
    for (const filename of MIGRATION_FILES.slice(
      0,
      MIGRATION_FILES.indexOf(target)
    ))
      sqlite.exec(readMigration(filename))

    // The two one-octave exercises as they existed before the migration.
    sqlite
      .prepare(
        "INSERT INTO exercises (id, scale_id, direction) VALUES (1, 1, 'ascending')"
      )
      .run()
    sqlite
      .prepare(
        "INSERT INTO exercises (id, scale_id, direction) VALUES (2, 1, 'descending')"
      )
      .run()

    sqlite.exec(readMigration(target))

    // Pre-existing exercises backfill truthfully to a single octave.
    expect(
      sqlite.prepare('SELECT id, octaves FROM exercises ORDER BY id').all()
    ).toEqual([
      { id: 1, octaves: 1 },
      { id: 2, octaves: 1 }
    ])

    // A step_index of 14 inserts; 15 is rejected.
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 14, 'C', 0, 1)"
        )
        .run()
    ).not.toThrow()
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 15, 'C', 0, 1)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)

    // A semitone_offset of 24 inserts; 25 is rejected.
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 0, 'C', 24, 1)"
        )
        .run()
    ).not.toThrow()
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 0, 'C', 25, 1)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)

    // A timing window of 15 samples inserts; 16 is rejected.
    sqlite
      .prepare(
        'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, 1, 1000, 60)'
      )
      .run()
    const insertAssessment = sqlite.prepare(
      `INSERT INTO run_assessments (
        run_id, algorithm_version, scoring_parameters, progression_policy_version,
        progression_parameters, hard_fault_count, timing_fault_count,
        overlap_fault_count, timing_sample_count, timing_excluded_count,
        mean_absolute_timing_deviation_us, passed, assessed_at_ms
      ) VALUES (1, 'v1', '{}', 'v1', '{}', 0, 0, 0, ?, 0, 0, 1, 1000)`
    )
    expect(() => insertAssessment.run(15)).not.toThrow()
    expect(() => insertAssessment.run(16)).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })

  it('migration 0009 adds nullable start offset without changing stored assessments', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = OFF')
    const target = '0009_best_fit_timing.sql'
    for (const filename of MIGRATION_FILES.slice(
      0,
      MIGRATION_FILES.indexOf(target)
    ))
      sqlite.exec(readMigration(filename))

    sqlite
      .prepare(
        'INSERT INTO runs (id, exercise_id, performed_at_ms, tempo_bpm) VALUES (1, 1, 1000, 60)'
      )
      .run()
    sqlite
      .prepare(
        `INSERT INTO run_assessments (
          run_id, algorithm_version, scoring_parameters, progression_policy_version,
          progression_parameters, hard_fault_count, timing_fault_count,
          overlap_fault_count, timing_sample_count, timing_excluded_count,
          mean_absolute_timing_deviation_us, passed, assessed_at_ms
        ) VALUES (1, 'stage2', '{}', 'v1', '{}', 0, 0, 0, 1, 0, 0, 1, 1000)`
      )
      .run()

    sqlite.exec(readMigration(target))
    expect(
      sqlite
        .prepare(
          'SELECT mean_absolute_timing_deviation_us, timing_start_offset_us FROM run_assessments'
        )
        .get()
    ).toEqual({
      mean_absolute_timing_deviation_us: 0,
      timing_start_offset_us: null
    })

    sqlite.close()
  })

  it('migration 0010 corrects the E-flat fingering cells and leaves everything else untouched', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = OFF')

    const priorFiles = MIGRATION_FILES.slice(
      0,
      MIGRATION_FILES.indexOf('0010_e_flat_fingering_correction.sql')
    )
    for (const filename of priorFiles) sqlite.exec(readMigration(filename))

    // Seed-like fixture replicating the pre-correction E-flat state: the
    // ascending fingering started on 2 ([2,1,2,3,4,1,2,3]) and descending
    // (its reverse) ended on 2 ([3,2,1,4,3,2,1,2]).
    const eFlatScaleId = (
      sqlite
        .prepare(
          "INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group) VALUES (1, 'e-flat-major', 'E-flat major', 3, 2) RETURNING id"
        )
        .get() as { id: number }
    ).id
    const insertExercise = sqlite.prepare(
      'INSERT INTO exercises (scale_id, direction) VALUES (?, ?) RETURNING id'
    )
    const ascendingId = (
      insertExercise.get(eFlatScaleId, 'ascending') as { id: number }
    ).id
    const descendingId = (
      insertExercise.get(eFlatScaleId, 'descending') as { id: number }
    ).id

    const oldAscending = [2, 1, 2, 3, 4, 1, 2, 3]
    const oldDescending = [3, 2, 1, 4, 3, 2, 1, 2]
    const insertStep = sqlite.prepare(
      'INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (?, ?, ?, ?, ?)'
    )
    oldAscending.forEach((finger, stepIndex) =>
      insertStep.run(
        ascendingId,
        stepIndex,
        'X',
        stepIndex === 0 ? 0 : stepIndex,
        finger
      )
    )
    oldDescending.forEach((finger, stepIndex) =>
      insertStep.run(descendingId, stepIndex, 'X', -stepIndex, finger)
    )
    // A control row from an unrelated exercise that must not change.
    const cMajorScaleId = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }
    const cMajorExerciseId = (
      insertExercise.get(cMajorScaleId.id, 'ascending') as { id: number }
    ).id
    insertStep.run(cMajorExerciseId, 0, 'C', 0, 1)

    sqlite.exec(readMigration('0010_e_flat_fingering_correction.sql'))

    const fingeringOf = (exerciseId: number): number[] =>
      sqlite
        .prepare(
          'SELECT finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
        )
        .all(exerciseId)
        .map((row) => (row as { finger_number: number }).finger_number)
    expect(fingeringOf(ascendingId)).toEqual([3, 1, 2, 3, 4, 1, 2, 3])
    expect(fingeringOf(descendingId)).toEqual([3, 2, 1, 4, 3, 2, 1, 3])
    expect(fingeringOf(cMajorExerciseId)).toEqual([1])
    sqlite.close()
  })

  it('scales enforces unique tonic_pitch_class and unique position within a group', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    // group-1/c-major (tonic 0, position 1) already exists from migration 0006.
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group) VALUES (1, 'g-major', 'G major', 0, 2)"
        )
        .run()
    ).toThrow(/UNIQUE constraint failed/)
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group) VALUES (1, 'g-major', 'G major', 7, 1)"
        )
        .run()
    ).toThrow(/UNIQUE constraint failed/)
    sqlite.close()
  })

  it('exercises.direction accepts descending and still rejects invalid directions', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    const scale = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }

    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO exercises (id, scale_id, direction) VALUES (1, ?, ?)'
        )
        .run(scale.id, 'descending')
    ).not.toThrow()

    expect(() =>
      sqlite
        .prepare(
          'INSERT INTO exercises (id, scale_id, direction) VALUES (2, ?, ?)'
        )
        .run(scale.id, 'sideways')
    ).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })

  it('exercise_steps.semitone_offset allows negative values for descending steps and still rejects out-of-range values', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)
    const scale = sqlite
      .prepare('SELECT id FROM scales WHERE slug = ?')
      .get('c-major') as { id: number }
    sqlite
      .prepare(
        'INSERT INTO exercises (id, scale_id, direction) VALUES (1, ?, ?)'
      )
      .run(scale.id, 'descending')

    // C major descending, anchored on the upper C: C B A G F E D C
    const descendingOffsets = [0, -1, -3, -5, -7, -8, -10, -12]
    const insertStep = sqlite.prepare(
      'INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, ?, ?, ?, 1)'
    )
    expect(() =>
      descendingOffsets.forEach((offset, index) =>
        insertStep.run(index, 'X', offset)
      )
    ).not.toThrow()
    expect(
      sqlite
        .prepare(
          'SELECT semitone_offset FROM exercise_steps WHERE exercise_id = 1 ORDER BY step_index'
        )
        .all()
    ).toEqual(descendingOffsets.map((semitone_offset) => ({ semitone_offset })))

    // 0008 widened the valid range to step_index 0..14 and offset -24..24,
    // so the old out-of-range values are now legal; test the new bounds.
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 15, 'Y', -25, 1)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO exercise_steps (exercise_id, step_index, note_spelling, semitone_offset, finger_number) VALUES (1, 15, 'Y', 25, 1)"
        )
        .run()
    ).toThrow(/CHECK constraint failed/)

    sqlite.close()
  })

  it('the trail view states world 1 as an enumerated path whose last step announces itself', () => {
    const sqlite = new Database(':memory:')
    applyMigrations(sqlite)

    // 0006 already inserts group-1 and c-major; add the rest of the world.
    const group = sqlite
      .prepare('SELECT id FROM progression_groups WHERE slug = ?')
      .get('group-1') as { id: number }
    const insertScale = sqlite.prepare(
      'INSERT INTO scales (progression_group_id, slug, display_name, tonic_pitch_class, position_in_group) VALUES (?, ?, ?, ?, ?)'
    )
    const rest: [string, string, number, number][] = [
      ['g-major', 'G major', 7, 2],
      ['d-major', 'D major', 2, 3],
      ['a-major', 'A major', 9, 4],
      ['e-major', 'E major', 4, 5],
      ['b-major', 'B major', 11, 6]
    ]
    for (const [slug, name, pitchClass, position] of rest)
      insertScale.run(group.id, slug, name, pitchClass, position)

    const path = sqlite
      .prepare(
        'SELECT step_number, node_name, steps_in_world, is_final_step FROM trail WHERE world_number = 1'
      )
      .all()

    // The path is readable in one query, in order, with no successor lookup.
    expect(path).toEqual([
      {
        step_number: 1,
        node_name: 'C major',
        steps_in_world: 6,
        is_final_step: 0
      },
      {
        step_number: 2,
        node_name: 'G major',
        steps_in_world: 6,
        is_final_step: 0
      },
      {
        step_number: 3,
        node_name: 'D major',
        steps_in_world: 6,
        is_final_step: 0
      },
      {
        step_number: 4,
        node_name: 'A major',
        steps_in_world: 6,
        is_final_step: 0
      },
      {
        step_number: 5,
        node_name: 'E major',
        steps_in_world: 6,
        is_final_step: 0
      },
      {
        step_number: 6,
        node_name: 'B major',
        steps_in_world: 6,
        is_final_step: 1
      }
    ])

    // Completing the world is read off the final row, never inferred from the
    // absence of a next one.
    const final = sqlite
      .prepare(
        'SELECT node_name FROM trail WHERE world_number = 1 AND is_final_step = 1'
      )
      .all()
    expect(final).toEqual([{ node_name: 'B major' }])

    // The view owns no rows, so it cannot drift from the seeded catalog.
    const views = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'view'")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(views).toContain('trail')

    sqlite.close()
  })
})
