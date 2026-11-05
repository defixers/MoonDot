import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase } from '../../src/main/db'
import { migrateDatabase } from '../../src/main/db/migrator'
import { inheritSettings } from '../../src/main/db/inherit-settings'
import { createSettingsService } from '../../src/main/services/settings'
import { createWorkService, RETENTION_MS } from '../../src/main/services/work'
import { defaultProjectDirectory } from '../../src/main/services/project-paths'
import {
  emptyStages,
  phases,
  projectDraftSchema,
  workSchemas,
  type ProjectDraft,
} from '../../src/shared/work'

const roots: string[] = [],
  connections: Database.Database[] = []
afterEach(() => {
  for (const db of connections.splice(0)) if (db.open) db.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'moondot-remake-'))
  roots.push(root)
  const database = openDatabase(join(root, 'new.db'))
  connections.push(database.sqlite)
  await migrateDatabase(database.sqlite, join(root, 'snapshots'))
  let time = Date.parse('2026-11-05T12:00:00Z')
  const service = createWorkService(database.sqlite, () => time)
  const draft = (overrides: Partial<ProjectDraft> = {}): ProjectDraft => ({
    name: '月光',
    type: 'single',
    description: '',
    cover: '',
    dueDate: '',
    stages: emptyStages(),
    parentDirectory: root,
    ...overrides,
  })
  return {
    root,
    database,
    service,
    draft,
    advance: (ms: number) => {
      time += ms
    },
  }
}
const list = { query: '', status: '' as const, trash: false, page: 1, pageSize: 100 }
it('deletes a trashed project directory only after name confirmation and preserves neighboring files', async () => {
  const { root, database, service, draft } = await fixture()
  const { id } = service.saveProject(draft())
  const directory = service.project({ id }).rootDirectory
  writeFileSync(join(directory, 'music.wav'), 'music')
  writeFileSync(join(root, 'keep.txt'), 'keep')
  const destination = join(root, 'system-trash')
  const trash = vi.fn(async (path: string) => {
    renameSync(path, destination)
  })
  const deletion = createWorkService(database.sqlite, undefined, undefined, undefined, trash)
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow('回收站')
  service.trashProject({ id })
  await expect(deletion.deleteProjectFiles({ id, name: 'wrong' })).rejects.toThrow('完整项目名称')
  expect(trash).not.toHaveBeenCalled()
  await deletion.deleteProjectFiles({ id, name: '月光' })
  expect(trash).toHaveBeenCalledExactlyOnceWith(directory)
  expect(existsSync(directory)).toBe(false)
  expect(readFileSync(join(destination, 'music.wav'), 'utf8')).toBe('music')
  expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('keep')
  expect(service.projects({ ...list, trash: true }).total).toBe(0)
})
it('does not delete records when the system reports success but the directory still exists', async () => {
  const { database, service, draft } = await fixture()
  const { id } = service.saveProject(draft())
  const directory = service.project({ id }).rootDirectory
  service.trashProject({ id })
  const trash = vi.fn(async () => {})
  const deletion = createWorkService(database.sqlite, undefined, undefined, undefined, trash)
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow(
    '项目目录仍然存在',
  )
  expect(deletion.get(id, true).rootDirectory).toBe(directory)
  expect(existsSync(directory)).toBe(true)
  service.restoreProject({ id })
  expect(service.project({ id }).id).toBe(id)
})
it('retains records and files on system trash failure and permits retry', async () => {
  const { root, database, service, draft } = await fixture()
  const { id } = service.saveProject(draft())
  const directory = service.project({ id }).rootDirectory
  service.trashProject({ id })
  const trash = vi
    .fn(async (path: string) => {
      renameSync(path, join(root, 'system-trash'))
    })
    .mockRejectedValueOnce(new Error('volume unavailable'))
  const deletion = createWorkService(database.sqlite, undefined, undefined, undefined, trash)
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow(
    '无法移入系统回收站',
  )
  expect(existsSync(directory)).toBe(true)
  expect(deletion.get(id, true).id).toBe(id)
  await deletion.deleteProjectFiles({ id, name: '月光' })
  expect(existsSync(directory)).toBe(false)
})
it('rejects missing, redirected and overlapping project roots before deleting files', async () => {
  const { root, database, service, draft } = await fixture()
  const { id } = service.saveProject(draft())
  const directory = service.project({ id }).rootDirectory
  service.trashProject({ id })
  const trash = vi.fn(async () => {})
  const deletion = createWorkService(database.sqlite, undefined, undefined, undefined, trash)
  const moved = join(root, 'moved')
  renameSync(directory, moved)
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow('目录不可用')
  symlinkSync(moved, directory, 'junction')
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow('指向已改变')
  // Remove only the junction created by this test, never its target.
  unlinkSync(directory)
  renameSync(moved, directory)
  const second = service.saveProject(draft({ name: 'other' }))
  database.sqlite
    .prepare('UPDATE projects SET root_directory = ? WHERE id = ?')
    .run(join(directory, phases[0].folder), second.id)
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow('占用')
  expect(trash).not.toHaveBeenCalled()
  expect(existsSync(directory)).toBe(true)
})
it('locks projects during deletion and keeps pending records across the seven-day cleanup boundary', async () => {
  const { root, database, service, draft } = await fixture()
  const { id } = service.saveProject(draft())
  const directory = service.project({ id }).rootDirectory
  service.trashProject({ id })
  let time = Date.parse(service.get(id, true).deletedAt!) + RETENTION_MS - 1
  let finish!: () => void
  const trash = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  const deletion = createWorkService(database.sqlite, () => time, undefined, undefined, trash)
  const pending = deletion.deleteProjectFiles({ id, name: '月光' })
  expect(() => deletion.restoreProject({ id })).toThrow('正在删除')
  expect(() => deletion.purgeProject({ id, name: '月光' })).toThrow('正在删除')
  await expect(deletion.deleteProjectFiles({ id, name: '月光' })).rejects.toThrow('正在删除')
  time += 1
  expect(deletion.cleanup()).toBe(0)
  renameSync(directory, join(root, 'system-trash'))
  finish()
  await pending
  expect(trash).toHaveBeenCalledTimes(1)
  expect(deletion.projects({ ...list, trash: true }).total).toBe(0)
})
it('creates the default moondot folder under the supplied system Documents path and supports explicit overrides', async () => {
  const { root, database, draft } = await fixture()
  const documents = join(root, 'redirected-documents')
  mkdirSync(documents)
  const service = createWorkService(
    database.sqlite,
    () => Date.now(),
    () => false,
    () => defaultProjectDirectory(documents),
  )
  expect(service.defaultProjectDirectory().directory).toBe(join(documents, 'moondot'))
  const first = service.saveProject(draft({ parentDirectory: undefined }))
  expect(service.project(first).rootDirectory).toBe(join(documents, 'moondot', '月光'))
  const second = service.saveProject(draft({ name: 'custom' }))
  expect(service.project(second).rootDirectory).toBe(join(root, 'custom'))
  const blocked = join(root, 'blocked-documents')
  mkdirSync(blocked)
  writeFileSync(join(blocked, 'moondot'), 'occupied')
  expect(() => defaultProjectDirectory(blocked)).toThrow()
  expect(readFileSync(join(blocked, 'moondot'), 'utf8')).toBe('occupied')
})
it('creates fixed folders with no personnel/dates and persists all edits without changing completion or disk name', async () => {
  const { root, database, service, draft } = await fixture()
  const { id } = service.saveProject(draft())
  const project = service.project({ id })
  expect(project.status).toBe('incomplete')
  expect(readdirSync(project.rootDirectory)).toEqual(phases.map((phase) => phase.folder))
  service.projectState({ id, status: 'completed' })
  const stages = emptyStages()
  stages[0]!.people['制作人'] = ['小月', '阿海']
  stages[1]!.people['作曲'] = ['小月']
  stages[4]!.dueDate = '2027-01-10'
  service.saveProject(
    draft({
      id,
      name: '新的项目名',
      stages,
      dueDate: '2027-01-20',
      description: '温暖的城市声音',
      type: 'album',
    }),
  )
  expect(service.project({ id }).rootDirectory).toBe(project.rootDirectory)
  database.sqlite.close()
  const reopened = openDatabase(join(root, 'new.db'))
  connections.push(reopened.sqlite)
  const saved = createWorkService(reopened.sqlite).project({ id })
  expect(saved).toMatchObject({
    status: 'completed',
    name: '新的项目名',
    stages,
    dueDate: '2027-01-20',
    type: 'album',
  })
  expect(saved.rootDirectory).toBe(project.rootDirectory)
  createWorkService(reopened.sqlite).projectState({ id, status: 'incomplete' })
  expect(createWorkService(reopened.sqlite).project({ id }).status).toBe('incomplete')
})
it('copies only display name and window state once and never modifies the legacy business database', async () => {
  const { root, database } = await fixture()
  const legacyPath = join(root, 'legacy.db')
  const legacy = new Database(legacyPath)
  legacy.exec(
    'CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE old_projects (name TEXT)',
  )
  legacy.prepare('INSERT INTO old_projects VALUES (?)').run('旧项目必须保留')
  const add = legacy.prepare('INSERT INTO app_settings VALUES (?, ?)')
  add.run('profile', JSON.stringify({ displayName: '本机音乐人' }))
  add.run('window', JSON.stringify({ width: 1200, height: 800, maximized: false }))
  add.run('work_preferences', JSON.stringify({ projectView: 'table' }))
  legacy.close()
  const before = readFileSync(legacyPath)
  inheritSettings(database.sqlite, legacyPath)
  expect(readFileSync(legacyPath)).toEqual(before)
  const settings = createSettingsService(database)
  expect(settings.getProfile().displayName).toBe('本机音乐人')
  expect(settings.getWindow().width).toBe(1200)
  expect(
    database.sqlite.prepare("SELECT 1 FROM app_settings WHERE key = 'work_preferences'").get(),
  ).toBeUndefined()
  expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 })
  settings.saveProfile({ displayName: '新名字' })
  inheritSettings(database.sqlite, legacyPath)
  expect(settings.getProfile().displayName).toBe('新名字')
})
it('rejects missing locations, existing names and overlapping roots including trashed projects', async () => {
  const { service, draft, root } = await fixture()
  expect(() => service.saveProject(draft({ parentDirectory: undefined }))).toThrow()
  mkdirSync(join(root, 'occupied'))
  writeFileSync(join(root, 'occupied', 'keep.txt'), 'keep')
  expect(() => service.saveProject(draft({ name: 'occupied' }))).toThrow()
  const { id } = service.saveProject(draft())
  const project = service.project({ id })
  expect(() =>
    service.saveProject(draft({ name: 'inside', parentDirectory: project.rootDirectory })),
  ).toThrow()
  const second = service.saveProject(draft({ name: '另一个项目' }))
  expect(() =>
    service.relocateProject({ id: second.id, directory: project.rootDirectory }),
  ).toThrow()
  service.trashProject({ id })
  expect(() =>
    service.saveProject(draft({ name: 'inside', parentDirectory: project.rootDirectory })),
  ).toThrow()
  expect(readFileSync(join(root, 'occupied', 'keep.txt'), 'utf8')).toBe('keep')
})
it('rolls back folders when database creation fails and leaves no project record', async () => {
  const { service, database, draft, root } = await fixture()
  database.sqlite.exec(
    "CREATE TRIGGER fail_create BEFORE INSERT ON projects BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
  )
  expect(() => service.saveProject(draft())).toThrow('forced failure')
  expect(existsSync(join(root, '月光'))).toBe(false)
  expect(service.projects(list).total).toBe(0)
})
it('restores moved directories only after relinking and purges records precisely seven days after deletion', async () => {
  const { root, service, draft, advance } = await fixture()
  const { id } = service.saveProject(draft())
  const original = service.project({ id }).rootDirectory
  writeFileSync(join(original, phases[0].folder, 'keep.txt'), 'music')
  service.trashProject({ id })
  const relocated = join(root, 'moved')
  renameSync(original, relocated)
  expect(() => service.restoreProject({ id })).toThrow()
  service.restoreProject({ id, directory: relocated })
  expect(service.project({ id }).rootDirectory).toBe(relocated)
  service.trashProject({ id })
  advance(RETENTION_MS - 1)
  expect(service.cleanup()).toBe(0)
  expect(service.projects({ ...list, trash: true }).total).toBe(1)
  advance(1)
  expect(service.cleanup()).toBe(1)
  expect(service.projects({ ...list, trash: true }).total).toBe(0)
  expect(readFileSync(join(relocated, phases[0].folder, 'keep.txt'), 'utf8')).toBe('music')
})
it('startup cleanup and manual purge delete only records', async () => {
  const { service, database, draft, advance } = await fixture()
  const { id } = service.saveProject(draft())
  const directory = service.project({ id }).rootDirectory
  expect(() => service.purgeProject({ id, name: '月光' })).toThrow()
  service.trashProject({ id })
  expect(() => service.purgeProject({ id, name: 'wrong' })).toThrow()
  service.purgeProject({ id, name: '月光' })
  expect(existsSync(directory)).toBe(true)
  const second = service.saveProject(draft({ name: '过期' }))
  service.trashProject({ id: second.id })
  advance(RETENTION_MS)
  createWorkService(database.sqlite, () => Date.parse('2026-11-05T12:00:00Z') + RETENTION_MS)
  expect(service.projects({ ...list, trash: true }).total).toBe(0)
})
it('searches only live project names, notes and people, including literal wildcard characters', async () => {
  const { service, draft } = await fixture()
  const stages = emptyStages()
  stages[1]!.people['编曲'] = ['小月']
  const { id } = service.saveProject(draft({ stages, description: '温暖 100%_声音' }))
  for (const query of ['月', '小月', '温暖', '%_'])
    expect(service.search({ query }).map((hit) => hit.id)).toEqual([id])
  service.trashProject({ id })
  expect(service.search({ query: '月' })).toEqual([])
})
it('validates fixed stages, personnel, dates and obsolete fields at IPC boundary', async () => {
  const { draft } = await fixture()
  expect(projectDraftSchema.safeParse(draft()).success).toBe(true)
  for (const value of [
    draft({ stages: emptyStages().slice(1) }),
    draft({ dueDate: '2026-02-30' }),
    { ...draft(), artist: 'removed' },
    { ...draft(), type: 'other' },
  ])
    expect(projectDraftSchema.safeParse(value).success).toBe(false)
  const stages = emptyStages()
  stages[0]!.people['作曲'] = ['不属于这个阶段']
  expect(projectDraftSchema.safeParse(draft({ stages })).success).toBe(false)
  expect(workSchemas.search.safeParse({ query: 'x', includeArchived: true }).success).toBe(false)
})
