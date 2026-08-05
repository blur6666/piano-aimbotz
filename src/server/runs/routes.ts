import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { SubmitRunSchema, type SubmitRun } from '../../shared/contracts.js'
import type { AppConfig } from '../config.js'
import { createRun } from './create-run.js'
import { readRun, listRuns } from './read-run.js'
import {
  NotFoundError,
  StaleTempoError,
  InvalidSequenceError,
  InvalidEventError
} from './errors.js'

export function registerRunRoutes(
  app: FastifyInstance,
  sqlite: Database.Database,
  config: AppConfig
): void {
  app.post<{ Body: SubmitRun }>(
    '/api/runs',
    { schema: { body: SubmitRunSchema } },
    async (request, reply) => {
      try {
        const result = createRun(sqlite, config, request.body)
        return reply.code(201).send(result)
      } catch (error) {
        if (
          error instanceof InvalidSequenceError ||
          error instanceof InvalidEventError
        )
          return reply.code(400).send({
            error: { code: 'invalid_request', message: error.message }
          })
        if (error instanceof NotFoundError)
          return reply
            .code(404)
            .send({ error: { code: 'not_found', message: error.message } })
        if (error instanceof StaleTempoError)
          return reply.code(409).send({
            error: {
              code: 'stale_tempo',
              message: error.message,
              currentTempoBpm: error.currentTempoBpm
            }
          })
        throw error
      }
    }
  )

  app.get<{ Params: { id: string } }>(
    '/api/runs/:id',
    async (request, reply) => {
      const runId = Number(request.params.id)
      if (!Number.isInteger(runId))
        return reply.code(400).send({
          error: {
            code: 'invalid_request',
            message: 'Run id must be an integer.'
          }
        })
      try {
        return readRun(sqlite, config, runId)
      } catch (error) {
        if (error instanceof NotFoundError)
          return reply
            .code(404)
            .send({ error: { code: 'not_found', message: error.message } })
        throw error
      }
    }
  )

  app.get<{ Querystring: { exerciseId?: string } }>(
    '/api/runs',
    async (request, reply) => {
      const raw = request.query.exerciseId
      const exerciseId = Number(raw)
      if (!raw || !Number.isInteger(exerciseId))
        return reply.code(400).send({
          error: {
            code: 'invalid_request',
            message: 'exerciseId query parameter is required.'
          }
        })
      return listRuns(sqlite, exerciseId)
    }
  )
}
