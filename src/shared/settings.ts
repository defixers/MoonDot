import { z } from 'zod'

export const profileSchema = z.object({ displayName: z.string().trim().max(80) }).strict()
export type Profile = z.infer<typeof profileSchema>
export const windowStateSchema = z.object({
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(1180).max(7680),
  height: z.number().int().min(760).max(4320),
  maximized: z.boolean(),
})
export type WindowState = z.infer<typeof windowStateSchema>
