import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { profileSchema, windowStateSchema } from '../../shared/settings'

// Open the legacy database read-only; copy only validated local settings, once.
export function inheritSettings(sqlite: Database.Database, legacyPath: string) {
  if (sqlite.prepare("SELECT 1 FROM app_settings WHERE key = 'legacy-settings-checked'").get())
    return
  const values: { key: string; value: string }[] = []
  if (existsSync(legacyPath)) {
    const legacy = new Database(legacyPath, { readonly: true, fileMustExist: true })
    try {
      if (legacy.prepare("SELECT 1 FROM sqlite_master WHERE name = 'app_settings'").get()) {
        for (const [key, schema] of [
          ['profile', profileSchema],
          ['window', windowStateSchema],
        ] as const) {
          const row = legacy.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
            { value: string } | undefined
          if (!row) continue
          const parsed = schema.safeParse(JSON.parse(row.value))
          if (parsed.success) values.push({ key, value: JSON.stringify(parsed.data) })
        }
      }
    } finally {
      legacy.close()
    }
  }
  sqlite.transaction(() => {
    const insert = sqlite.prepare('INSERT OR IGNORE INTO app_settings VALUES (?, ?, ?)')
    for (const item of values) insert.run(item.key, item.value, new Date().toISOString())
    insert.run('legacy-settings-checked', 'true', new Date().toISOString())
  })()
}
