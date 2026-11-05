import { z } from 'zod'
import type { IpcResult } from './system'

export const projectStatuses = {
  planning: '筹备中',
  active: '进行中',
  on_hold: '暂停',
  completed: '已完成',
  archived: '已归档',
} as const
export const taskStatuses = {
  todo: '待办',
  doing: '进行中',
  review: '待确认',
  done: '已完成',
  canceled: '已取消',
} as const
export const priorities = { low: '低', medium: '中', high: '高', urgent: '紧急' } as const
export const projectTypes = {
  single: '单曲',
  ep: 'EP',
  album: '专辑',
  ost: '影视配乐',
  score: '游戏配乐',
  other: '其他',
} as const
const id = z.string().uuid()
const line = (max: number) => z.string().trim().max(max)
const title = line(120).min(1)
export const dateSchema = z.union([z.literal(''), z.iso.date()])
export const stageDraftSchema = z
  .object({ name: title, weight: z.number().positive().max(1000) })
  .strict()
export const templateSchema = z
  .object({ id: id.optional(), name: title, stages: z.array(stageDraftSchema).min(1).max(30) })
  .strict()
export const projectDraftSchema = z
  .object({
    id: id.optional(),
    name: title,
    artist: line(120),
    type: z.enum(['single', 'ep', 'album', 'ost', 'score', 'other']),
    genre: line(80),
    bpm: z.number().int().min(20).max(400).nullable(),
    musicalKey: line(40),
    dueDate: dateSchema,
    participants: line(1000),
    description: line(10000),
    tags: z.array(line(30).min(1)).max(20),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    cover: z.union([
      z.literal(''),
      z
        .string()
        .max(2800000)
        .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/),
    ]),
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']),
    templateId: id.optional(),
    initialTasks: z.boolean().optional(),
  })
  .strict()
export const taskDraftSchema = z
  .object({
    id: id.optional(),
    projectId: id,
    stageId: id.nullable(),
    parentId: id.nullable(),
    title,
    description: line(10000),
    status: z.enum(['todo', 'doing', 'review', 'done', 'canceled']),
    priority: z.enum(['low', 'medium', 'high', 'urgent']),
    dueDate: dateSchema,
    assignee: line(120),
  })
  .strict()
export const preferencesSchema = z
  .object({
    projectView: z.enum(['cards', 'table']),
    taskView: z.enum(['board', 'list']),
    defaultTemplateId: id.nullable(),
  })
  .strict()
export const workSchemas = {
  templates: z.undefined(),
  saveTemplate: templateSchema,
  deleteTemplate: z.object({ id }).strict(),
  projects: z
    .object({
      query: line(120),
      status: z.union([
        z.literal(''),
        z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']),
      ]),
      tag: line(30),
      stage: line(120),
      dueBefore: dateSchema,
      trash: z.boolean(),
      sort: z.enum(['updated', 'due', 'progress']),
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1).max(100),
    })
    .strict(),
  project: z.object({ id }).strict(),
  saveProject: projectDraftSchema,
  projectState: z
    .object({ id, status: z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']) })
    .strict(),
  trashProject: z.object({ id }).strict(),
  restoreProject: z.object({ id }).strict(),
  purgeProject: z.object({ id, name: title }).strict(),
  stageState: z.object({ id, status: z.enum(['todo', 'doing', 'done']) }).strict(),
  tasks: z
    .object({
      projectId: id.nullable(),
      status: z.union([z.literal(''), z.enum(['todo', 'doing', 'review', 'done', 'canceled'])]),
      priority: z.union([z.literal(''), z.enum(['low', 'medium', 'high', 'urgent'])]),
      stageId: id.nullable(),
      dueBefore: dateSchema,
      query: line(120),
      trash: z.boolean(),
    })
    .strict(),
  saveTask: taskDraftSchema,
  moveTask: z
    .object({
      id,
      status: z.enum(['todo', 'doing', 'review', 'done', 'canceled']),
      beforeId: id.nullable(),
    })
    .strict(),
  trashTask: z.object({ id }).strict(),
  restoreTask: z.object({ id }).strict(),
  saveNote: z
    .object({ id: id.optional(), projectId: id, taskId: id.nullable(), body: line(10000).min(1) })
    .strict(),
  deleteNote: z.object({ id }).strict(),
  search: z.object({ query: line(120).min(1), includeArchived: z.boolean() }).strict(),
  preferences: z.undefined(),
  savePreferences: preferencesSchema,
  undo: z.object({ token: id }).strict(),
} as const
export type ProjectDraft = z.infer<typeof projectDraftSchema>
export type TaskDraft = z.infer<typeof taskDraftSchema>
export type TemplateDraft = z.infer<typeof templateSchema>
export type Preferences = z.infer<typeof preferencesSchema>
export interface Template extends Omit<TemplateDraft, 'id'> {
  id: string
}
export interface Project extends Omit<ProjectDraft, 'id' | 'templateId' | 'initialTasks'> {
  id: string
  code: string
  progress: number
  health: 'normal' | 'risk' | 'overdue'
  currentStage: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
export interface Stage {
  id: string
  projectId: string
  name: string
  weight: number
  position: number
  status: 'todo' | 'doing' | 'done'
  completion: number
}
export interface Task extends Omit<TaskDraft, 'id'> {
  id: string
  rank: string
  completedAt: string | null
  updatedAt: string
  deletedAt: string | null
  projectName: string
  projectColor: string
  projectStatus: Project['status']
  noteCount: number
  childCount: number
  childDone: number
}
export interface Note {
  id: string
  projectId: string
  taskId: string | null
  body: string
  author: string
  createdAt: string
  updatedAt: string
}
export interface Activity {
  id: string
  action: string
  actor: string
  createdAt: string
}
export interface ProjectDetail {
  project: Project
  stages: Stage[]
  tasks: Task[]
  notes: Note[]
  activity: Activity[]
}
export interface SearchHit {
  id: string
  kind: 'project' | 'task' | 'note'
  projectId: string
  taskId: string | null
  title: string
  excerpt: string
  projectName: string
}
export interface Mutation {
  id: string
  undoToken?: string
}
export interface WorkOutputs {
  templates: Template[]
  saveTemplate: Mutation
  deleteTemplate: Mutation
  projects: { items: Project[]; total: number }
  project: ProjectDetail
  saveProject: Mutation
  projectState: Mutation
  trashProject: Mutation
  restoreProject: Mutation
  purgeProject: Mutation
  stageState: Mutation
  tasks: Task[]
  saveTask: Mutation
  moveTask: Mutation
  trashTask: Mutation
  restoreTask: Mutation
  saveNote: Mutation
  deleteNote: Mutation
  search: SearchHit[]
  preferences: Preferences
  savePreferences: Preferences
  undo: Mutation
}
export type WorkMethod = keyof typeof workSchemas
export type WorkInput<K extends WorkMethod> = z.infer<(typeof workSchemas)[K]>
export type WorkApi = {
  [K in WorkMethod]: (input: WorkInput<K>) => Promise<IpcResult<WorkOutputs[K]>>
}
