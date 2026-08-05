import fs from 'node:fs'
import path from 'node:path'
import { openSqlite } from './connection.js'

const root = process.cwd()
const sqlite = openSqlite()
const migration = fs.readFileSync(
  path.join(root, 'migrations/0001_stage1.sql'),
  'utf8'
)
sqlite.exec(migration)
sqlite.close()
