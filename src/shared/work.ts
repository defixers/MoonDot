import { z } from 'zod'
import type { IpcResult } from './system'

export const projectTypes = { single: '单曲', album: '专辑', ep: 'EP' } as const
export const projectStatuses = { incomplete: '未完成', completed: '已完成' } as const
export const phases = [
  {
    key: 'planning',
    name: '策划与统筹',
    folder: '01 策划与统筹',
    roles: ['企划', '制作人', '音乐总监', '统筹'],
  },
  { key: 'creation', name: '创作', folder: '02 创作', roles: ['作曲', '编曲', '作词'] },
  {
    key: 'recording',
    name: '录音与演奏',
    folder: '03 录音与演奏',
    roles: ['歌手（演唱者）', '乐手（演奏者）', '录音工程师'],
  },
  {
    key: 'production',
    name: '后期制作',
    folder: '04 后期制作',
    roles: ['音频编辑', '混音工程师', '母带工程师'],
  },
  {
    key: 'release',
    name: '视觉与发行',
    folder: '05 视觉与发行',
    roles: ['艺术总监', 'MV/PV导演', '宣传'],
  },
] as const
export const phaseKeySchema = z.enum(['planning', 'creation', 'recording', 'production', 'release'])
export type PhaseKey = z.infer<typeof phaseKeySchema>
const id = z.string().uuid()
const line = (max: number) => z.string().trim().max(max)
const title = line(120).min(1)
export const dateSchema = z.union([z.literal(''), z.iso.date()])
export const MAX_COVER_BYTES = 10 * 1024 * 1024
export const MAX_ROLE_PEOPLE = 100
export const MAX_PERSON_LENGTH = 120
export const MAX_PEOPLE_INPUT = MAX_ROLE_PEOPLE * (MAX_PERSON_LENGTH + 1)
const personSchema = z
  .string()
  .trim()
  .normalize()
  .min(1)
  .max(MAX_PERSON_LENGTH)
  .refine((name) => !/[\p{Cc}\p{Cf}]/u.test(name), '姓名不能包含控制字符或隐藏格式字符')
export const personnelSchema = z
  .array(personSchema)
  .max(MAX_ROLE_PEOPLE)
  .transform((names) => [...new Set(names)])
export function parsePersonnel(text: string) {
  if (text.length > MAX_PEOPLE_INPUT)
    return { names: [], error: '输入过长，每个岗位最多 100 人，每个姓名最多 120 个字符' }
  const names = text
    .split(/[\r\n,，、;；]/)
    .map((name) => name.trim())
    .filter(Boolean)
  const parsed = personnelSchema.safeParse(names)
  return parsed.success
    ? { names: parsed.data, error: '' }
    : {
        names: [],
        error:
          names.length > MAX_ROLE_PEOPLE
            ? '每个岗位最多填写 100 人'
            : names.some((name) => name.length > MAX_PERSON_LENGTH)
              ? '每个姓名最多 120 个字符'
              : '姓名不能包含控制字符或隐藏格式字符',
      }
}
export const coverSchema = z
  .string()
  .max(4 * Math.ceil(MAX_COVER_BYTES / 3) + 32)
  .refine((value) => {
    if (!value) return true
    if (value.length > 4 * Math.ceil(MAX_COVER_BYTES / 3) + 32) return false
    const header = /^data:image\/(png|jpeg|webp);base64,/.exec(value)
    if (!header) return false
    const encoded = value.slice(header[0].length)
    if (!encoded.length || encoded.length % 4 || /[^A-Za-z0-9+/=]/.test(encoded)) return false
    const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
    if (encoded.slice(0, encoded.length - padding).includes('=')) return false
    return (encoded.length / 4) * 3 - padding <= MAX_COVER_BYTES
  }, '请选择不超过 10 MB 的 PNG、JPEG 或 WebP 图片')
const path = z.string().min(1).max(32768)
const roles = new Set<string>(phases.flatMap((phase) => [...phase.roles]))
// Validate original keys before Zod's record parser discards special object keys.
const peopleByRoleSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ((Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null) ||
        Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !roles.has(key)))
    )
      ctx.addIssue({ code: 'custom', message: '无效岗位' })
  })
  .pipe(z.record(z.string().max(40), personnelSchema))
export const stageSchema = z
  .object({
    key: phaseKeySchema,
    dueDate: dateSchema,
    people: peopleByRoleSchema,
  })
  .strict()
  .superRefine((stage, ctx) => {
    const phase = phases.find((item) => item.key === stage.key)!
    if (
      Object.keys(stage.people).some((role) => !(phase.roles as readonly string[]).includes(role))
    )
      ctx.addIssue({ code: 'custom', message: '岗位不属于此阶段' })
  })
export const projectDraftSchema = z
  .object({
    id: id.optional(),
    name: title,
    type: z.enum(['single', 'album', 'ep']),
    description: line(10000),
    dueDate: dateSchema,
    cover: coverSchema,
    stages: z
      .array(stageSchema)
      .length(5)
      .refine(
        (items) => phases.every((phase, index) => items[index]?.key === phase.key),
        '需要五个固定阶段',
      ),
    parentDirectory: path.optional(),
  })
  .strict()
const location = { projectId: id, stage: phaseKeySchema, directory: z.string().max(32768) }
const entry = { ...location, name: line(255).min(1) }
export const workSchemas = {
  projects: z
    .object({
      query: line(120),
      status: z.enum(['', 'incomplete', 'completed']),
      trash: z.boolean(),
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1).max(100),
    })
    .strict(),
  project: z.object({ id }).strict(),
  saveProject: projectDraftSchema,
  projectState: z.object({ id, status: z.enum(['incomplete', 'completed']) }).strict(),
  trashProject: z.object({ id }).strict(),
  restoreProject: z.object({ id, directory: path.optional() }).strict(),
  purgeProject: z.object({ id, name: title }).strict(),
  deleteProjectFiles: z.object({ id, name: title }).strict(),
  relocateProject: z.object({ id, directory: path }).strict(),
  search: z.object({ query: line(120).min(1) }).strict(),
  chooseDirectory: z.undefined(),
  defaultProjectDirectory: z.undefined(),
  checkDirectory: z.object({ directory: path }).strict(),
  chooseImports: z.object({ folders: z.boolean() }).strict(),
  files: z.object(location).strict(),
  createFolder: z.object(entry).strict(),
  renameFile: z.object({ ...entry, newName: line(255).min(1) }).strict(),
  trashFile: z.object(entry).strict(),
  openFolder: z.object(location).strict(),
  revealFile: z.object(entry).strict(),
  startImport: z
    .object({
      ...location,
      sources: z.array(path).min(1).max(1000),
    })
    .strict(),
  importStatus: z.object({ id }).strict(),
  cancelImport: z.object({ id }).strict(),
} as const
export type Stage = z.infer<typeof stageSchema>
export type ProjectDraft = z.infer<typeof projectDraftSchema>
export interface Project extends Omit<ProjectDraft, 'id' | 'parentDirectory'> {
  id: string
  rootDirectory: string
  status: keyof typeof projectStatuses
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
export interface Mutation {
  id: string
}
export interface SearchHit {
  id: string
  title: string
  excerpt: string
}
export interface FileEntry {
  name: string
  directory: boolean
  size: number
  modifiedAt: string
  addedAt: string
}
export interface FileListing {
  entries: FileEntry[]
  writable: boolean
  path: string
}
export interface ImportJob {
  id: string
  projectId: string
  state: 'running' | 'completed' | 'cancelled'
  total: number
  completed: number
  current: string
  bytes: number
  failures: { name: string; message: string }[]
}
export interface WorkOutputs {
  projects: { items: Project[]; total: number }
  project: Project
  saveProject: Mutation
  projectState: Mutation
  trashProject: Mutation
  restoreProject: Mutation
  purgeProject: Mutation
  deleteProjectFiles: Mutation
  relocateProject: Mutation
  search: SearchHit[]
  chooseDirectory: string | null
  defaultProjectDirectory: { directory: string }
  checkDirectory: { directory: string }
  chooseImports: string[]
  files: FileListing
  createFolder: Mutation
  renameFile: Mutation
  trashFile: Mutation
  openFolder: Mutation
  revealFile: Mutation
  startImport: ImportJob
  importStatus: ImportJob
  cancelImport: ImportJob
}
export type WorkMethod = keyof typeof workSchemas
export type WorkInput<K extends WorkMethod> = z.infer<(typeof workSchemas)[K]>
export type WorkApi = {
  [K in WorkMethod]: (input: WorkInput<K>) => Promise<IpcResult<WorkOutputs[K]>>
}
export const emptyStages = (): Stage[] =>
  phases.map((phase) => ({
    key: phase.key,
    dueDate: '',
    people: Object.fromEntries(phase.roles.map((role) => [role, []])),
  }))
