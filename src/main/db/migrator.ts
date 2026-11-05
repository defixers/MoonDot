import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { foundationMigration } from './migrations/0001-foundation'
import { projectsMigration } from './migrations/0002-projects'

export interface Migration {
  version: number
  name: string
  sql: string
}
export const migrations: readonly Migration[] = [foundationMigration, projectsMigration]
const checksum = (migration: Migration) => createHash('sha256').update(migration.sql).digest('hex')

export async function migrateDatabase(
  sqlite: Database.Database,
  snapshotDirectory: string,
  planned: readonly Migration[] = migrations,
) {
  if (planned.some((migration, index) => migration.version !== index + 1)) {
    throw new Error('Migration versions must be contiguous and start at 1')
  }
  const version = Number(sqlite.pragma('user_version', { simple: true }))
  if (version > planned.length)
    throw new Error('Database is newer than this application; downgrade refused')
  const hasHistory = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE name = '_moondot_migrations'")
    .get()
  const history = hasHistory
    ? (sqlite
        .prepare('SELECT version, name, checksum FROM _moondot_migrations ORDER BY version')
        .all() as { version: number; name: string; checksum: string }[])
    : []
  if (
    history.length !== version ||
    history.some((entry, index) => {
      const migration = planned[index]
      return (
        !migration ||
        entry.version !== migration.version ||
        entry.name !== migration.name ||
        entry.checksum !== checksum(migration)
      )
    })
  )
    throw new Error('Migration history mismatch; database left unchanged')
  if (
    !hasHistory &&
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get()
  ) {
    throw new Error('Unversioned database contains unknown tables; automatic migration refused')
  }
  if (version === planned.length) return { version, snapshot: null }

  // SQLite's online backup includes committed WAL pages. A failed backup prevents all DDL.
  mkdirSync(snapshotDirectory, { recursive: true })
  const snapshot = join(snapshotDirectory, `v${version}-${Date.now()}-${randomUUID()}.db`)
  await sqlite.backup(snapshot)
  sqlite.transaction(() => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS _moondot_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL
    )`)
    const insert = sqlite.prepare('INSERT INTO _moondot_migrations VALUES (?, ?, ?, ?)')
    for (const migration of planned.slice(version)) {
      sqlite.exec(migration.sql)
      insert.run(migration.version, migration.name, checksum(migration), new Date().toISOString())
      sqlite.pragma(`user_version = ${migration.version}`)
    }
  })()
  return { version: planned.length, snapshot }
}
