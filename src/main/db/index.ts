import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export function openDatabase(filename: string): {
  sqlite: Database.Database
  db: BetterSQLite3Database
} {
  mkdirSync(dirname(filename), { recursive: true })
  const sqlite = new Database(filename)
  try {
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')
    sqlite.pragma('synchronous = FULL')
    sqlite.pragma('busy_timeout = 5000')
    return { sqlite, db: drizzle(sqlite) }
  } catch (error) {
    sqlite.close()
    throw error
  }
}
