import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/db'
import { migrateDatabase as migrateAll, type Migration } from '../../src/main/db/migrator'
import { foundationMigration } from '../../src/main/db/migrations/0001-foundation'
import { createSettingsService } from '../../src/main/services/settings'

const connections: Database.Database[] = []
// Keep failure/rollback fixtures scoped to the foundation schema; work.test.ts covers the isolated remake database.
const migrations = [foundationMigration]
const migrateDatabase = (
  sqlite: Database.Database,
  snapshots: string,
  planned: readonly Migration[] = migrations,
) => migrateAll(sqlite, snapshots, planned)
const directories: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'moondot-迁移 测试-'))
  directories.push(root)
  const database = openDatabase(join(root, 'data/moondot.db'))
  connections.push(database.sqlite)
  return {
    root,
    database,
    snapshots: join(root, 'snapshots'),
    service: createSettingsService(database),
  }
}
afterEach(() => {
  for (const db of connections.splice(0)) if (db.open) db.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('database migration and persistence', () => {
  it('creates the schema, persists settings, and is idempotent on reopen', async () => {
    const { root, database, snapshots, service } = fixture()
    expect((await migrateDatabase(database.sqlite, snapshots)).version).toBe(1)
    expect(service.getProfile()).toEqual({ displayName: '' })
    service.saveProfile({ displayName: '  中文音乐人  ' })
    expect(() => service.saveProfile({ displayName: 'x'.repeat(81) })).toThrow()
    database.sqlite.close()
    const reopened = openDatabase(join(root, 'data/moondot.db'))
    connections.push(reopened.sqlite)
    expect(await migrateDatabase(reopened.sqlite, snapshots)).toEqual({
      version: 1,
      snapshot: null,
    })
    expect(createSettingsService(reopened).getProfile()).toEqual({ displayName: '中文音乐人' })
    expect(readdirSync(snapshots)).toHaveLength(1)
    expect(reopened.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(reopened.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(reopened.sqlite.pragma('synchronous', { simple: true })).toBe(2)
    expect(reopened.sqlite.pragma('busy_timeout', { simple: true })).toBe(5000)
  })
  it('captures committed WAL content before upgrading', async () => {
    const { root, database, snapshots, service } = fixture()
    await migrateDatabase(database.sqlite, snapshots)
    service.saveProfile({ displayName: '迁移前的设置' })
    const result = await migrateDatabase(database.sqlite, snapshots, [
      ...migrations,
      { version: 2, name: '0002-test', sql: 'CREATE TABLE added (id INTEGER);' },
    ])
    const backup = new Database(result.snapshot!, { readonly: true })
    connections.push(backup)
    expect(backup.pragma('user_version', { simple: true })).toBe(1)
    expect(backup.prepare("SELECT value FROM app_settings WHERE key = 'profile'").get()).toEqual({
      value: JSON.stringify({ displayName: '迁移前的设置' }),
    })
    expect(
      backup.prepare("SELECT name FROM sqlite_master WHERE name = 'added'").get(),
    ).toBeUndefined()
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok')
    expect(result.version).toBe(2)
    service.saveProfile({ displayName: '升级后的设置' })
    const restoredPath = join(root, 'restored.db')
    copyFileSync(result.snapshot!, restoredPath)
    const restored = openDatabase(restoredPath)
    connections.push(restored.sqlite)
    expect(await migrateDatabase(restored.sqlite, join(root, 'restore-snapshots'))).toEqual({
      version: 1,
      snapshot: null,
    })
    expect(createSettingsService(restored).getProfile().displayName).toBe('迁移前的设置')
  })
  it('rolls back the whole upgrade on failed SQL', async () => {
    const { database, snapshots, service } = fixture()
    await migrateDatabase(database.sqlite, snapshots)
    service.saveProfile({ displayName: '保留我' })
    await expect(
      migrateDatabase(database.sqlite, snapshots, [
        ...migrations,
        {
          version: 2,
          name: '0002-broken',
          sql: 'CREATE TABLE transient (id INTEGER); INSERT INTO missing VALUES (1);',
        },
      ]),
    ).rejects.toThrow()
    expect(database.sqlite.pragma('user_version', { simple: true })).toBe(1)
    expect(
      database.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'transient'").get(),
    ).toBeUndefined()
    expect(service.getProfile().displayName).toBe('保留我')
    expect(
      database.sqlite.prepare('SELECT COUNT(*) AS count FROM _moondot_migrations').get(),
    ).toEqual({ count: 1 })
  })
  it('does not change schema if the snapshot cannot be created', async () => {
    const { root, database, snapshots } = fixture()
    await migrateDatabase(database.sqlite, snapshots)
    const blocked = join(root, 'not-a-directory')
    writeFileSync(blocked, 'occupied')
    await expect(
      migrateDatabase(database.sqlite, blocked, [
        ...migrations,
        { version: 2, name: '0002-test', sql: 'CREATE TABLE added (id INTEGER);' },
      ]),
    ).rejects.toThrow()
    expect(database.sqlite.pragma('user_version', { simple: true })).toBe(1)
  })
  it('refuses downgrade without rewriting the database or making another snapshot', async () => {
    const { database, snapshots } = fixture()
    await migrateDatabase(database.sqlite, snapshots, [
      ...migrations,
      { version: 2, name: '0002-test', sql: 'CREATE TABLE added (id INTEGER);' },
    ])
    await expect(migrateDatabase(database.sqlite, snapshots)).rejects.toThrow('downgrade refused')
    expect(database.sqlite.pragma('user_version', { simple: true })).toBe(2)
    expect(readdirSync(snapshots)).toHaveLength(1)
  })
  it('rejects changed migration history and unknown unversioned schemas', async () => {
    const { database, snapshots } = fixture()
    await migrateDatabase(database.sqlite, snapshots)
    await expect(
      migrateDatabase(database.sqlite, snapshots, [{ ...migrations[0]!, sql: 'SELECT 1;' }]),
    ).rejects.toThrow('history mismatch')
    const unknown = fixture()
    unknown.database.sqlite.exec('CREATE TABLE existing_data (id INTEGER)')
    await expect(migrateDatabase(unknown.database.sqlite, unknown.snapshots)).rejects.toThrow(
      'unknown tables',
    )
  })
})
