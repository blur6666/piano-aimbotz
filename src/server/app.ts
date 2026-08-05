import Fastify, { type FastifyInstance } from 'fastify'
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

  registerExerciseRoutes(app, sqlite)
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
