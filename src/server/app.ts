import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { openSqlite } from './db/connection.js'
import { loadConfig, type AppConfig } from './config.js'
import { registerExerciseRoutes } from './exercises/routes.js'
import { registerRunRoutes } from './runs/routes.js'

export function buildApp(
  sqlite: Database.Database = openSqlite(),
  config: AppConfig = loadConfig()
): FastifyInstance {
  const app = Fastify({ logger: false })

  // All API errors use one envelope (docs/ARCHITECTURE.md). Routes that already
  // know their status code (404/409/400 for bad sequence numbers, etc.)
  // send it directly; this is the catch-all for TypeBox validation
  // failures and anything else thrown unexpectedly. Non-validation errors
  // never expose their message -- it could contain SQL or stack details.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation)
      return reply
        .code(400)
        .send({ error: { code: 'invalid_request', message: error.message } })
    return reply.code(500).send({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.'
      }
    })
  })

  registerExerciseRoutes(app, sqlite, config)
  registerRunRoutes(app, sqlite, config)

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
