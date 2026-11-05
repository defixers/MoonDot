import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

test('Electron 启动、隔离的 IPC、SQLite WAL 与事务可用', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moondot-中文 e2e-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  env.MOONDOT_USER_DATA = directory
  delete env.ELECTRON_RUN_AS_NODE
  let application: ElectronApplication | undefined
  try {
    application = await electron.launch({ args: [resolve('.')], env })
    const page = await application.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await page.screenshot({ path: test.info().outputPath('startup.png') })
    const isolation = await page.evaluate(
      '({ node: typeof window.require, process: typeof window.process, bridge: typeof window.moondot.system.health })',
    )
    expect(isolation).toEqual({ node: 'undefined', process: 'undefined', bridge: 'function' })
    const result = await application.evaluate(({ app }) => {
      const { createRequire } = process.getBuiltinModule('node:module')
      const { join } = process.getBuiltinModule('node:path')
      const require = createRequire(join(app.getAppPath(), 'package.json'))
      const Database = require('better-sqlite3') as typeof import('better-sqlite3')
      const filename = join(app.getPath('userData'), 'probe.db')
      let db = new Database(filename)
      try {
        db.pragma('journal_mode = WAL')
        db.exec('CREATE TABLE probe (value TEXT NOT NULL)')
        db.prepare('INSERT INTO probe VALUES (?)').run('月句 · 中文路径与持久化')
        try {
          db.transaction(() => {
            db.exec('DELETE FROM probe')
            throw new Error('rollback')
          })()
        } catch {
          /* The transaction must roll back. */
        }
        db.close()
        db = new Database(filename)
        db.exec("CREATE VIRTUAL TABLE search_probe USING fts5(text, tokenize='trigram')")
        return {
          row: db.prepare('SELECT value FROM probe').get(),
          integrity: db.pragma('integrity_check', { simple: true }),
          journal: db.pragma('journal_mode', { simple: true }),
        }
      } finally {
        db.close()
      }
    })
    expect(result).toEqual({
      row: { value: '月句 · 中文路径与持久化' },
      integrity: 'ok',
      journal: 'wal',
    })
  } finally {
    await application?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
