import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../../src/main/db'
import { migrateDatabase } from '../../src/main/db/migrator'
import { foundationMigration } from '../../src/main/db/migrations/0001-foundation'
import { createWorkService } from '../../src/main/services/work'
import { createSettingsService } from '../../src/main/services/settings'
import { workSchemas, type ProjectDraft, type TaskDraft } from '../../src/shared/work'

const cleanups: (() => void)[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const cleanup of cleanups.splice(0)) cleanup()
})
async function fixture(upgrade = false) {
  const root = mkdtempSync(join(tmpdir(), 'moondot-work-')),
    filename = join(root, 'data.db'),
    db = openDatabase(filename)
  cleanups.push(() => {
    if (db.sqlite.open) db.sqlite.close()
    rmSync(root, { recursive: true, force: true })
  })
  if (upgrade) {
    await migrateDatabase(db.sqlite, join(root, 'snapshots'), [foundationMigration])
    createSettingsService(db).saveProfile({ displayName: '制作人' })
  }
  const migration = await migrateDatabase(db.sqlite, join(root, 'snapshots'))
  const service = createWorkService(
    db.sqlite,
    () => createSettingsService(db).getProfile().displayName,
  )
  const project = (changes: Partial<ProjectDraft> = {}) =>
    service.saveProject({
      name: '月光计划',
      artist: '林深',
      type: 'single',
      genre: '独立流行',
      bpm: 100,
      musicalKey: 'C',
      dueDate: '',
      participants: '乐手',
      description: '首次制作',
      tags: ['独立'],
      color: '#2563eb',
      cover: '',
      status: 'active',
      ...changes,
    }).id
  const task = (projectId: string, changes: Partial<TaskDraft> = {}) =>
    service.saveTask({
      projectId,
      title: '录制主唱',
      description: '确认歌词细节',
      stageId: null,
      parentId: null,
      status: 'todo',
      priority: 'medium',
      dueDate: '',
      assignee: '',
      ...changes,
    }).id
  return { root, filename, db, service, project, task, migration }
}
it('upgrades v1 data without losing settings and persists project/search data on reopen', async () => {
  const { db, filename, service, project, migration } = await fixture(true)
  expect(migration.version).toBe(2)
  expect(migration.snapshot).toBeTruthy()
  expect(createSettingsService(db).getProfile().displayName).toBe('制作人')
  const id = project({ initialTasks: true })
  expect(service.project({ id }).tasks).toHaveLength(2)
  db.sqlite.close()
  const reopened = openDatabase(filename)
  try {
    const stored = createWorkService(reopened.sqlite, () => '')
    expect(stored.project({ id }).project.name).toBe('月光计划')
    expect(stored.search({ query: '月光', includeArchived: false })).toHaveLength(1)
    expect(reopened.sqlite.pragma('foreign_key_check')).toEqual([])
  } finally {
    reopened.sqlite.close()
  }
})
it('normalizes template weights and copies stages without changing existing projects', async () => {
  const { service, project } = await fixture()
  const { id } = service.saveTemplate({
    name: '自定义',
    stages: [
      { name: '制作', weight: 3 },
      { name: '交付', weight: 1 },
    ],
  })
  const first = project({ templateId: id })
  expect(service.project({ id: first }).stages.map((s) => s.weight)).toEqual([75, 25])
  service.saveTemplate({ id, name: '重做流程', stages: [{ name: '新阶段', weight: 1 }] })
  expect(service.project({ id: first }).stages.map((s) => s.name)).toEqual(['制作', '交付'])
  expect(service.project({ id: project({ templateId: id }) }).stages.map((s) => s.name)).toEqual([
    '新阶段',
  ])
  expect(() =>
    service.saveTemplate({ name: '非法', stages: [{ name: '阶段', weight: 0 }] }),
  ).toThrow()
})
it('computes weighted progress from root tasks and excludes canceled/deleted tasks', async () => {
  const { service, project, task } = await fixture()
  const template = service.saveTemplate({
    name: '进度',
    stages: [
      { name: '录音', weight: 3 },
      { name: '交付', weight: 1 },
    ],
  }).id
  const id = project({ templateId: template }),
    [record, delivery] = service.project({ id }).stages
  service.stageState({ id: delivery!.id, status: 'done' })
  const a = task(id, { stageId: record!.id, status: 'done' }),
    b = task(id, { stageId: record!.id })
  task(id, { parentId: a, stageId: record!.id })
  task(id, { stageId: record!.id, status: 'canceled' })
  expect(service.project({ id }).project.progress).toBe(63)
  service.trashTask({ id: b })
  expect(service.project({ id }).project.progress).toBe(100)
  service.moveTask({ id: a, status: 'review', beforeId: null })
  expect(service.project({ id }).project.progress).toBe(25)
  expect(service.project({ id }).tasks.find((t) => t.id === a)?.completedAt).toBeNull()
})
it('enforces project ownership, parent constraints and archive read-only in the service', async () => {
  const { service, project, task } = await fixture()
  const a = project(),
    b = project(),
    stage = service.project({ id: b }).stages[0]!.id
  expect(() => task(a, { stageId: stage })).toThrow('阶段不属于')
  const parent = task(a),
    child = task(a, { parentId: parent })
  expect(() => task(b, { parentId: parent })).toThrow('同项目')
  expect(() => task(a, { parentId: child })).toThrow('顶层')
  service.projectState({ id: a, status: 'archived' })
  expect(() => task(a)).toThrow('只读')
  expect(() => service.moveTask({ id: parent, status: 'done', beforeId: null })).toThrow('只读')
  expect(() => service.saveNote({ projectId: a, taskId: null, body: '修改' })).toThrow('只读')
  expect(() =>
    service.stageState({ id: service.project({ id: a }).stages[0]!.id, status: 'done' }),
  ).toThrow('只读')
  expect(() => service.trashProject({ id: a })).toThrow('只读')
  service.projectState({ id: a, status: 'active' })
  expect(() => task(a)).not.toThrow()
})
it('soft deletes a subtree, restores only the same batch, and permanently deletes only with exact confirmation', async () => {
  const { service, project, task, db } = await fixture()
  const id = project(),
    parent = task(id),
    child = task(id, { parentId: parent })
  service.saveNote({ projectId: id, taskId: child, body: '子任务备注' })
  service.trashTask({ id: parent })
  expect(service.project({ id }).tasks).toHaveLength(0)
  expect(() => service.restoreTask({ id: child })).toThrow('父任务')
  service.restoreTask({ id: parent })
  expect(service.project({ id }).tasks).toHaveLength(2)
  service.trashProject({ id })
  expect(service.search({ query: '备注', includeArchived: true })).toHaveLength(0)
  expect(() => service.project({ id })).toThrow()
  service.restoreProject({ id })
  expect(service.project({ id }).notes).toHaveLength(1)
  expect(() => service.purgeProject({ id, name: '月光计划' })).toThrow()
  service.trashProject({ id })
  expect(() => service.purgeProject({ id, name: '错误' })).toThrow()
  service.purgeProject({ id, name: '月光计划' })
  expect(db.sqlite.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 0 })
  expect(db.sqlite.prepare('SELECT count(*) AS n FROM search_index').get()).toEqual({ n: 0 })
  expect(db.sqlite.pragma('foreign_key_check')).toEqual([])
})
it('searches Chinese short terms, FTS phrases, literal wildcards and excludes deleted/archived records', async () => {
  const { service, project, task } = await fixture()
  const id = project({ name: '月光制作计划', description: '收录 100% 的灵感' })
  const tid = task(id, { title: '制作计划录音' })
  const note = service.saveNote({ projectId: id, taskId: tid, body: '春天的声音与月光' }).id
  expect(service.search({ query: '月光', includeArchived: false }).map((hit) => hit.kind)).toEqual([
    'project',
    'note',
  ])
  expect(service.search({ query: '制作计划', includeArchived: false })[0]?.id).toBe(tid)
  expect(service.search({ query: '%', includeArchived: false }).map((hit) => hit.id)).toEqual([id])
  expect(() => service.search({ query: '" OR *', includeArchived: false })).not.toThrow()
  service.saveNote({ id: note, projectId: id, taskId: tid, body: '秋天的回声' })
  expect(service.search({ query: '春天的', includeArchived: false })).toHaveLength(0)
  expect(service.search({ query: '秋天的', includeArchived: false })).toHaveLength(1)
  service.projectState({ id, status: 'archived' })
  expect(service.search({ query: '月光', includeArchived: false })).toHaveLength(0)
  expect(service.search({ query: '月光', includeArchived: true })).toHaveLength(1)
})
it('moves one task atomically and offers bounded undo that refuses stale edits', async () => {
  const { service, project, task, db } = await fixture()
  const id = project(),
    a = task(id, { title: '甲' }),
    b = task(id, { title: '乙' }),
    c = task(id, { title: '丙' })
  const initial = service.project({ id }).tasks.map((t) => ({ id: t.id, rank: t.rank }))
  const moved = service.moveTask({ id: c, status: 'todo', beforeId: a })
  expect(service.project({ id }).tasks.map((t) => t.id)).toEqual([c, a, b])
  expect(service.project({ id }).tasks.find((t) => t.id === a)?.rank).toBe(initial[0]?.rank)
  service.undo({ token: moved.undoToken! })
  expect(service.project({ id }).tasks.map((t) => t.id)).toEqual([a, b, c])
  const deletion = service.trashTask({ id: a })
  task(id)
  expect(() => service.undo({ token: deletion.undoToken! })).toThrow('数据已变化')
  const expired = service.trashTask({ id: b })
  vi.useFakeTimers()
  vi.setSystemTime(Date.now() + 6000)
  expect(() => service.undo({ token: expired.undoToken! })).toThrow('过期')
  expect(
    db.sqlite.prepare('SELECT count(*) AS n FROM activity_logs WHERE project_id=?').get(id),
  ).toBeTruthy()
})
it('validates IPC dates, status enums and default-template preferences', async () => {
  const { service } = await fixture()
  const id = service.templates(undefined)[0]!.id
  service.savePreferences({ projectView: 'table', taskView: 'list', defaultTemplateId: id })
  service.deleteTemplate({ id })
  expect(service.preferences(undefined).defaultTemplateId).toBeNull()
  expect(workSchemas.projectState.safeParse({ id, status: '已归档' }).success).toBe(false)
  expect(
    workSchemas.tasks.safeParse({
      projectId: null,
      status: '',
      priority: '',
      stageId: null,
      dueBefore: '2026-02-30',
      query: '',
      trash: false,
    }).success,
  ).toBe(false)
})

it('restores deleted tasks with distinct ranks after their previous positions were reused', async () => {
  const { service, project, task } = await fixture()
  const id = project(),
    first = task(id),
    second = task(id)
  service.trashTask({ id: second })
  const replacement = task(id)
  service.restoreTask({ id: second })
  const restored = service.project({ id }).tasks
  expect(restored.map((item) => item.id)).toEqual([first, replacement, second])
  expect(new Set(restored.map((item) => item.rank)).size).toBe(3)
  service.moveTask({ id: second, status: 'todo', beforeId: replacement })
  expect(service.project({ id }).tasks.map((item) => item.id)).toEqual([first, second, replacement])
})

it('does not restore a previously deleted child when two deletion batches share a clock tick', async () => {
  const { service, project, task } = await fixture()
  const id = project(),
    parent = task(id),
    child = task(id, { parentId: parent })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-05T00:00:00Z'))
  service.trashTask({ id: child })
  service.trashTask({ id: parent })
  service.restoreTask({ id: parent })
  expect(service.project({ id }).tasks.map((item) => item.id)).toEqual([parent])
  service.restoreTask({ id: child })
  expect(service.project({ id }).tasks).toHaveLength(2)
})
