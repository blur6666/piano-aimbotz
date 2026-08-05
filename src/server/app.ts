import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import { Type } from '@sinclair/typebox'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlite } from './db/connection.js'
import { SubmitRunSchema, type SubmitRun } from '../shared/contracts.js'
import { countHardFaults } from '../domain/scoring.js'

type ExerciseRow = {
  id: number
  slug: string
  name: string
  direction: string
  tonic_pitch_class: number
  tempo_bpm: number
}

export function buildApp(sqlite = openSqlite()): FastifyInstance {
  const app = Fastify({ logger: false })

  app.get('/api/exercises', async (_request, reply) => {
    const exercise = sqlite
      .prepare('SELECT * FROM exercises ORDER BY id')
      .get() as ExerciseRow | undefined
    if (!exercise)
      return reply.code(503).send({
        error: { code: 'not_seeded', message: 'Run npm run seed first.' }
      })
    const steps = sqlite
      .prepare(
        'SELECT step_index, note_spelling, finger_number FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
      )
      .all(exercise.id) as Array<{
      step_index: number
      note_spelling: string
      finger_number: number
    }>
    return {
      exercises: [
        {
          id: exercise.id,
          name: exercise.name,
          direction: exercise.direction,
          tempoBpm: exercise.tempo_bpm,
          steps: steps.map((step) => ({
            stepIndex: step.step_index,
            noteSpelling: step.note_spelling,
            fingerNumber: step.finger_number
          }))
        }
      ]
    }
  })

  app.post<{ Body: SubmitRun }>(
    '/api/runs',
    { schema: { body: SubmitRunSchema } },
    async (request, reply) => {
      const body = request.body
      for (let index = 0; index < body.events.length; index += 1) {
        if (body.events[index].sequenceNumber !== index) {
          return reply.code(400).send({
            error: {
              code: 'invalid_sequence',
              message:
                'Event sequence numbers must start at zero and be contiguous.'
            }
          })
        }
      }
      const exercise = sqlite
        .prepare('SELECT * FROM exercises WHERE id = ?')
        .get(body.exerciseId) as ExerciseRow | undefined
      if (!exercise)
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Exercise not found.' }
        })
      if (body.tempoBpm !== exercise.tempo_bpm) {
        return reply.code(409).send({
          error: {
            code: 'stale_tempo',
            message: 'The exercise tempo is no longer current.',
            currentTempoBpm: exercise.tempo_bpm
          }
        })
      }
      const steps = sqlite
        .prepare(
          'SELECT semitone_offset FROM exercise_steps WHERE exercise_id = ? ORDER BY step_index'
        )
        .all(exercise.id) as Array<{ semitone_offset: number }>
      const hardFaultCount = countHardFaults(
        exercise.tonic_pitch_class,
        steps.map((step) => step.semitone_offset),
        body.events
      )
      const transaction = sqlite.transaction(() => {
        const result = sqlite
          .prepare(
            'INSERT INTO runs (exercise_id, performed_at_ms, tempo_bpm) VALUES (?, ?, ?)'
          )
          .run(body.exerciseId, body.firstExpectedBeatAtMs, body.tempoBpm)
        const insert = sqlite.prepare(
          'INSERT INTO midi_events (run_id, sequence_number, offset_us, event_type, midi_pitch, velocity) VALUES (?, ?, ?, ?, ?, ?)'
        )
        for (const event of body.events)
          insert.run(
            result.lastInsertRowid,
            event.sequenceNumber,
            event.offsetUs,
            event.type,
            event.midiPitch,
            event.velocity
          )
        return Number(result.lastInsertRowid)
      })
      const runId = transaction()
      return reply.code(201).send({
        run: {
          id: runId,
          exerciseId: body.exerciseId,
          firstExpectedBeatAtMs: body.firstExpectedBeatAtMs,
          tempoBpm: body.tempoBpm
        },
        hardFaultCount
      })
    }
  )

  const clientRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../client'
  )
  app.register(fastifyStatic, { root: clientRoot, prefix: '/' })
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/'))
      return reply
        .code(404)
        .send({ error: { code: 'not_found', message: 'Not found.' } })
    return reply.sendFile('index.html')
  })
  app.addHook('onClose', async () => sqlite.close())
  return app
}
