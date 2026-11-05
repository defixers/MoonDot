import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { openDatabase } from '../db'
import { appSettings } from '../db/schema'
import {
  profileSchema,
  windowStateSchema,
  type Profile,
  type WindowState,
} from '../../shared/settings'

export function createSettingsService(database: ReturnType<typeof openDatabase>) {
  function read<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
    const row = database.db.select().from(appSettings).where(eq(appSettings.key, key)).get()
    if (!row) return fallback
    const parsed = schema.safeParse(row.value)
    if (!parsed.success) throw new Error(`Invalid stored setting: ${key}`)
    return parsed.data
  }
  function write(key: string, value: unknown) {
    database.db
      .insert(appSettings)
      .values({ key, value, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date().toISOString() },
      })
      .run()
  }
  return {
    getProfile: () => read('profile', profileSchema, { displayName: '' }),
    saveProfile: (input: Profile) => {
      const value = profileSchema.parse(input)
      database.sqlite.transaction(() => write('profile', value))()
      return value
    },
    getWindow: () =>
      read('window', windowStateSchema, { width: 1280, height: 840, maximized: false }),
    saveWindow: (value: WindowState) => write('window', windowStateSchema.parse(value)),
  }
}
