import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../../src/main/db'
import { migrateDatabase } from '../../src/main/db/migrator'
import { createWorkService } from '../../src/main/services/work'
import { createFileService, type FileHost } from '../../src/main/services/files'
import { emptyStages, phases, type WorkInput } from '../../src/shared/work'
const roots: string[] = []
const connections: ReturnType<typeof openDatabase>[] = []
const services: ReturnType<typeof createFileService>[] = []
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose()
  for (const connection of connections.splice(0)) connection.sqlite.close()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'moondot-files-'))
  roots.push(root)
  const database = openDatabase(join(root, 'data.db'))
  connections.push(database)
  await migrateDatabase(database.sqlite, join(root, 'snapshots'))
  const work = createWorkService(
    database.sqlite,
    () => Date.now(),
    (id) => files?.busy(id) ?? false,
  )
  const project = work.saveProject({
    name: '音乐工程',
    type: 'ep',
    description: '',
    dueDate: '',
    cover: '',
    stages: emptyStages(),
    parentDirectory: root,
  })
  const projectRoot = work.get(project.id).rootDirectory
  const stageRoot = join(projectRoot, phases[0].folder)
  const host: FileHost = {
    chooseDirectory: async () => root,
    chooseImports: async () => [],
    trash: vi.fn(async () => {
      throw new Error('trash unavailable')
    }),
    open: vi.fn(async () => ''),
    reveal: vi.fn(),
  }
  const files: ReturnType<typeof createFileService> = createFileService(
    database.sqlite,
    work.get,
    host,
  )
  services.push(files)
  const location: WorkInput<'files'> = { projectId: project.id, stage: 'planning', directory: '' }
  async function importFiles(sources: string[]) {
    const job = files!.startImport({ ...location, sources })
    await vi.waitFor(() => expect(files!.importStatus({ id: job.id }).state).not.toBe('running'))
    return files!.importStatus({ id: job.id })
  }
  return { root, database, work, files, location, projectRoot, stageRoot, host, importFiles }
}
it('copies files and nested folders, automatically numbers conflicts and preserves successful import timestamps', async () => {
  const f = await fixture()
  const source = join(f.root, 'song.wav')
  writeFileSync(source, 'waveform')
  const folder = join(f.root, 'session')
  mkdirSync(join(folder, 'nested'), { recursive: true })
  writeFileSync(join(folder, 'nested', 'song.wav'), 'another song')
  expect((await f.importFiles([source, folder])).completed).toBe(2)
  expect(readFileSync(source, 'utf8')).toBe('waveform')
  expect(readFileSync(join(f.stageRoot, 'session/nested/song.wav'), 'utf8')).toBe('another song')
  expect((await f.importFiles([source])).completed).toBe(1)
  expect(readFileSync(join(f.stageRoot, 'song (1).wav'), 'utf8')).toBe('waveform')
  expect((await f.importFiles([source])).completed).toBe(1)
  expect(readFileSync(join(f.stageRoot, 'song (2).wav'), 'utf8')).toBe('waveform')
  const first = f.files.files(f.location)
  const added = first.entries.find((entry) => entry.name === 'song.wav')!.addedAt
  writeFileSync(join(f.stageRoot, 'song.wav'), 'external edit')
  expect(
    f.files.files(f.location).entries.find((entry) => entry.name === 'song.wav')!.addedAt,
  ).toBe(added)
  const nested = f.files.files({ ...f.location, directory: 'session/nested' })
  expect(nested.entries[0]!.addedAt).toBe(
    first.entries.find((entry) => entry.name === 'session')!.addedAt,
  )
})
it('only discovers the open directory, detects external changes and keeps timestamps across rename', async () => {
  const f = await fixture()
  mkdirSync(join(f.stageRoot, 'child'))
  writeFileSync(join(f.stageRoot, 'child/external.txt'), 'text')
  writeFileSync(join(f.stageRoot, 'visible.txt'), 'text')
  const listing = f.files.files(f.location)
  const added = listing.entries.find((entry) => entry.name === 'visible.txt')!.addedAt
  expect(f.database.sqlite.prepare('SELECT COUNT(*) AS n FROM project_files').get()).toEqual({
    n: 2,
  })
  f.files.renameFile({ ...f.location, name: 'visible.txt', newName: 'renamed.txt' })
  expect(
    f.files.files(f.location).entries.find((entry) => entry.name === 'renamed.txt')!.addedAt,
  ).toBe(added)
  rmSync(join(f.stageRoot, 'renamed.txt'))
  expect(f.files.files(f.location).entries.map((entry) => entry.name)).toEqual(['child'])
  f.files.files({ ...f.location, directory: 'child' })
  expect(f.database.sqlite.prepare('SELECT COUNT(*) AS n FROM project_files').get()).toEqual({
    n: 2,
  })
})
it('reports failures, cleans partial copies on cancellation and blocks conflicting project operations', async () => {
  const f = await fixture()
  const source = join(f.root, 'large.wav')
  writeFileSync(source, Buffer.alloc(16 * 1024 * 1024))
  const job = f.files.startImport({ ...f.location, sources: [source] })
  expect(() => f.work.trashProject({ id: f.location.projectId })).toThrow()
  f.files.cancelImport({ id: job.id })
  await vi.waitFor(() => expect(f.files.importStatus({ id: job.id }).state).toBe('cancelled'))
  expect(readdirSync(f.stageRoot)).toEqual([])
  const result = await f.importFiles([join(f.root, 'missing.wav'), source])
  expect(result.completed).toBe(1)
  expect(result.failures).toHaveLength(1)
  expect(f.files.files(f.location).entries).toHaveLength(1)
})
it('never publishes an import when metadata cannot be committed', async () => {
  const f = await fixture()
  const source = join(f.root, 'source.txt')
  writeFileSync(source, 'keep original')
  f.database.sqlite.exec(
    "CREATE TRIGGER fail_metadata BEFORE INSERT ON project_files BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
  )
  const result = await f.importFiles([source])
  expect(result.failures).toHaveLength(1)
  expect(readdirSync(f.stageRoot)).toEqual([])
  expect(f.database.sqlite.prepare('SELECT COUNT(*) AS n FROM project_files').get()).toEqual({
    n: 0,
  })
  expect(readFileSync(source, 'utf8')).toBe('keep original')
})
it('rejects path escapes, protected stage names, recursive self imports and symlinks', async () => {
  const f = await fixture()
  expect(() => f.files.files({ ...f.location, directory: '../' })).toThrow()
  expect(() => f.files.renameFile({ ...f.location, name: '..', newName: 'moved' })).toThrow()
  expect(() => f.files.createFolder({ ...f.location, name: '../outside' })).toThrow()
  expect((await f.importFiles([f.projectRoot])).failures).toHaveLength(1)
  const outside = join(f.root, 'outside')
  mkdirSync(outside)
  symlinkSync(outside, join(f.stageRoot, 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(() => f.files.files({ ...f.location, directory: 'link' })).toThrow()
  expect((await f.importFiles([join(f.stageRoot, 'link')])).failures).toHaveLength(1)
})
it('does not overwrite on rename, retains files if system trash fails, and supports shell actions', async () => {
  const f = await fixture()
  writeFileSync(join(f.stageRoot, 'a.txt'), 'a')
  writeFileSync(join(f.stageRoot, 'b.txt'), 'b')
  expect(() => f.files.renameFile({ ...f.location, name: 'a.txt', newName: 'b.txt' })).toThrow()
  await expect(f.files.trashFile({ ...f.location, name: 'a.txt' })).rejects.toThrow('系统回收站')
  expect(readFileSync(join(f.stageRoot, 'a.txt'), 'utf8')).toBe('a')
  await f.files.openFolder(f.location)
  f.files.revealFile({ ...f.location, name: 'a.txt' })
  expect(f.host.open).toHaveBeenCalledWith(f.stageRoot)
  expect(f.host.reveal).toHaveBeenCalledWith(join(f.stageRoot, 'a.txt'))
  const trash = join(f.root, 'system-trash')
  mkdirSync(trash)
  f.host.trash = async (path) => {
    renameSync(path, join(trash, 'a.txt'))
  }
  await f.files.trashFile({ ...f.location, name: 'a.txt' })
  expect(existsSync(join(f.stageRoot, 'a.txt'))).toBe(false)
  expect(readFileSync(join(trash, 'a.txt'), 'utf8')).toBe('a')
})
it('reports missing disks and validates relinking without moving files', async () => {
  const f = await fixture()
  const moved = join(f.root, 'moved')
  renameSync(f.projectRoot, moved)
  expect(() => f.files.files(f.location)).toThrow('目录')
  f.work.relocateProject({ id: f.location.projectId, directory: moved })
  expect(f.files.files(f.location).path).toBe(join(moved, phases[0].folder))
  expect(existsSync(f.projectRoot)).toBe(false)
})
