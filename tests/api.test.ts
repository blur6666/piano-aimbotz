import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { buildApp } from '../src/server/app.js'

const schema = `CREATE TABLE exercises (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, direction TEXT NOT NULL, tonic_pitch_class INTEGER NOT NULL, tempo_bpm INTEGER NOT NULL);
CREATE TABLE exercise_steps (id INTEGER PRIMARY KEY, exercise_id INTEGER NOT NULL, step_index INTEGER NOT NULL, note_spelling TEXT NOT NULL, semitone_offset INTEGER NOT NULL, finger_number INTEGER NOT NULL, UNIQUE(exercise_id, step_index));
CREATE TABLE runs (id INTEGER PRIMARY KEY, exercise_id INTEGER NOT NULL, performed_at_ms INTEGER NOT NULL, tempo_bpm INTEGER NOT NULL);
CREATE TABLE midi_events (id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL, sequence_number INTEGER NOT NULL, offset_us INTEGER NOT NULL, event_type TEXT NOT NULL, midi_pitch INTEGER NOT NULL, velocity INTEGER NOT NULL, UNIQUE(run_id, sequence_number));`

describe('run API', () => {
  let sqlite: Database.Database | undefined
  afterEach(async () => {
    sqlite?.close()
    sqlite = undefined
  })

  it('stores a completed run and raw events atomically', async () => {
    sqlite = new Database(':memory:')
    sqlite.exec(schema)
    sqlite
      .prepare(
        "INSERT INTO exercises VALUES (1, 'c-major-ascending', 'C major ascending', 'ascending', 0, 60)"
      )
      .run()
    const steps = [
      ['C', 0, 1],
      ['D', 2, 2],
      ['E', 4, 3],
      ['F', 5, 1],
      ['G', 7, 2],
      ['A', 9, 3],
      ['B', 11, 4],
      ['C', 12, 5]
    ]
    steps.forEach(([note, offset, finger], index) =>
      sqlite!
        .prepare('INSERT INTO exercise_steps VALUES (?, 1, ?, ?, ?, ?)')
        .run(index + 1, index, note, offset, finger)
    )
    const app = buildApp(sqlite)
    const response = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        exerciseId: 1,
        firstExpectedBeatAtMs: 1000,
        tempoBpm: 60,
        events: [
          {
            sequenceNumber: 0,
            offsetUs: 0,
            type: 'note_on',
            midiPitch: 60,
            velocity: 100
          },
          {
            sequenceNumber: 1,
            offsetUs: 100,
            type: 'note_on',
            midiPitch: 61,
            velocity: 100
          }
        ]
      }
    })
    expect(response.statusCode).toBe(201)
    expect(response.json().hardFaultCount).toBe(1)
    expect(
      sqlite.prepare('SELECT count(*) as count FROM midi_events').get()
    ).toEqual({ count: 2 })
    await app.close()
  })
})
