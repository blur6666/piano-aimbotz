import { buildApp } from './app.js'
import { openSqlite } from './db/connection.js'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sqlite = openSqlite()
sqlite.exec(
  fs.readFileSync(path.join(root, 'migrations/0001_stage1.sql'), 'utf8')
)
const app = buildApp(sqlite)
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
await app.listen({ host, port })
console.log(`Piano Scale Trainer listening on http://localhost:${port}`)
