import { z } from 'zod'
import type { Profile } from './settings'
import type { WorkApi } from './work'

export const systemHealthSchema = z.object({
  appVersion: z.string(),
  electronVersion: z.string(),
  sqliteVersion: z.string(),
  journalMode: z.literal('wal'),
  foreignKeys: z.literal(true),
  schemaVersion: z.number().int().positive(),
})

export type SystemHealth = z.infer<typeof systemHealthSchema>
export type IpcResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
export interface MoonDotApi {
  work: WorkApi
  system: { health: () => Promise<IpcResult<SystemHealth>> }
  settings: {
    getProfile: () => Promise<IpcResult<Profile>>
    saveProfile: (input: Profile) => Promise<IpcResult<Profile>>
  }
}
