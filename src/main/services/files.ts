import { randomUUID } from 'node:crypto'
import {
  constants,
  accessSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { lstat, mkdir, readdir, rm, utimes } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type Database from 'better-sqlite3'
import type { FileEntry, ImportJob, Project, WorkInput } from '../../shared/work'
import {
  assertWritable,
  canonicalDirectory,
  contains,
  existingEntry,
  fileKey,
  fileName,
  stageDirectory,
} from './project-paths'
import { WorkError } from './work-error'

export interface FileHost {
  chooseDirectory(): Promise<string | null>
  chooseImports(folders: boolean): Promise<string[]>
  trash(path: string): Promise<void>
  open(path: string): Promise<string>
  reveal(path: string): void
}
interface Running {
  job: ImportJob
  controller: AbortController
  promise?: Promise<void>
}
const message = (error: unknown) => {
  if (error instanceof WorkError) return error.message
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return '磁盘空间不足'
  if (code === 'EACCES' || code === 'EPERM') return '没有读写权限或文件正在使用'
  if (code === 'ENOENT' || code === 'ENODEV') return '文件或磁盘不可用'
  return '文件操作失败，请检查目录、磁盘及权限'
}
export function createFileService(
  sqlite: Database.Database,
  get: (id: string) => Project,
  host: FileHost,
  report: (error: unknown) => void = () => {},
) {
  const jobs = new Map<string, Running>()
  const locks = new Set<string>()
  const busy = (id: string) =>
    locks.has(id) ||
    [...jobs.values()].some((item) => item.job.projectId === id && item.job.state === 'running')
  function idle(id: string) {
    if (busy(id)) throw new WorkError('CONFLICT', '文件操作进行中，请先等待完成或取消导入')
  }
  function locate(input: WorkInput<'files'>, write = false) {
    const project = get(input.projectId)
    const directory = stageDirectory(project, input.stage, input.directory)
    if (write) assertWritable(directory)
    return { project, directory }
  }
  const insert = sqlite.prepare('INSERT OR IGNORE INTO project_files VALUES (?, ?, ?)')
  function forget(projectId: string, prefix: string) {
    const rows = sqlite
      .prepare('SELECT path FROM project_files WHERE project_id = ?')
      .all(projectId) as { path: string }[]
    const remove = sqlite.prepare('DELETE FROM project_files WHERE project_id = ? AND path = ?')
    for (const row of rows)
      if (row.path === prefix || row.path.startsWith(prefix + '/')) remove.run(projectId, row.path)
  }
  function rememberTree(project: Project, target: string, timestamp: string) {
    insert.run(project.id, fileKey(project.rootDirectory, target), timestamp)
    if (lstatSync(target).isDirectory())
      for (const entry of readdirSync(target)) rememberTree(project, join(target, entry), timestamp)
  }
  function files(input: WorkInput<'files'>) {
    const { project, directory } = locate(input)
    const entries: FileEntry[] = []
    const seen = new Set<string>()
    const timestamp = new Date().toISOString()
    const names = readdirSync(directory, { withFileTypes: true })
    const pending = new Set<string>()
    for (const item of names) {
      if (!item.name.startsWith('.moondot-pending-') || !item.isFile()) continue
      try {
        pending.add(readFileSync(join(directory, item.name), 'utf8'))
      } catch {
        /* A pending commit remains hidden by its staging name. */
      }
    }
    sqlite.transaction(() => {
      for (const item of names) {
        if (
          item.name.startsWith('.moondot-') ||
          pending.has(item.name) ||
          item.isSymbolicLink() ||
          (!item.isFile() && !item.isDirectory())
        )
          continue
        const target = join(directory, item.name)
        if (item.isDirectory() && existsSync(join(target, '.moondot-incomplete'))) continue
        try {
          const stat = lstatSync(target)
          const key = fileKey(project.rootDirectory, target)
          seen.add(key)
          insert.run(project.id, key, timestamp)
          const row = sqlite
            .prepare('SELECT added_at FROM project_files WHERE project_id = ? AND path = ?')
            .get(project.id, key) as { added_at: string }
          entries.push({
            name: item.name,
            directory: stat.isDirectory(),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            addedAt: row.added_at,
          })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      const prefix = fileKey(project.rootDirectory, directory) + '/'
      const known = sqlite
        .prepare('SELECT path FROM project_files WHERE project_id = ?')
        .all(project.id) as { path: string }[]
      for (const row of known) {
        if (!row.path.startsWith(prefix)) continue
        const first = prefix + row.path.slice(prefix.length).split('/')[0]
        if (!seen.has(first)) forget(project.id, first)
      }
    })()
    let writable = true
    try {
      accessSync(directory, constants.W_OK)
    } catch {
      writable = false
    }
    entries.sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
    )
    return { entries, writable, path: directory }
  }
  function getJob(id: string) {
    const running = jobs.get(id)
    if (!running) throw new WorkError('NOT_FOUND', '导入记录已结束或应用已重启')
    return running
  }
  async function copyTree(source: string, target: string, running: Running) {
    running.controller.signal.throwIfAborted()
    const stat = await lstat(source)
    if (stat.isSymbolicLink())
      throw new WorkError('INVALID_OPERATION', '不导入符号链接，请选择实际文件或文件夹')
    if (stat.isDirectory()) {
      await mkdir(target)
      for (const name of await readdir(source)) {
        fileName(name)
        await copyTree(join(source, name), join(target, name), running)
      }
    } else if (stat.isFile()) {
      const input = createReadStream(source)
      input.on('data', (chunk) => {
        running.job.bytes += chunk.length
      })
      await pipeline(input, createWriteStream(target, { flags: 'wx' }), {
        signal: running.controller.signal,
      })
    } else throw new WorkError('INVALID_OPERATION', '不支持导入此文件类型')
    await utimes(target, stat.atime, stat.mtime)
  }
  // Reserve the final directory exclusively. A marker hides incomplete folders even after a crash.
  function publishFolder(staging: string, target: string) {
    mkdirSync(target)
    const moved: string[] = []
    try {
      writeFileSync(join(target, '.moondot-incomplete'), '')
      for (const name of readdirSync(staging)) {
        if (existsSync(join(target, name))) throw new WorkError('CONFLICT', '目标目录被外部修改')
        renameSync(join(staging, name), join(target, name))
        moved.push(name)
      }
      unlinkSync(join(target, '.moondot-incomplete'))
      rmdirSync(staging)
    } catch (error) {
      let rolledBack = true
      for (const name of moved.reverse()) {
        try {
          renameSync(join(target, name), join(staging, name))
        } catch (rollback) {
          rolledBack = false
          report(rollback)
        }
      }
      try {
        if (rolledBack && readdirSync(target).every((name) => name === '.moondot-incomplete')) {
          unlinkSync(join(target, '.moondot-incomplete'))
          rmdirSync(target)
        }
      } catch (rollback) {
        report(rollback)
      }
      throw error
    }
  }
  async function importBatch(
    input: WorkInput<'startImport'>,
    running: Running,
    project: Project,
    destination: string,
  ) {
    const job = running.job
    try {
      for (const source of input.sources) {
        if (running.controller.signal.aborted) break
        job.current = basename(source)
        const staging = join(destination, `.moondot-import-${randomUUID()}`)
        let marker: string | undefined
        let published: string | undefined
        try {
          fileName(basename(source))
          const sourceStat = await lstat(source)
          if (sourceStat.isSymbolicLink())
            throw new WorkError('INVALID_OPERATION', '请导入实际文件，不能导入链接')
          if (sourceStat.isDirectory() && contains(canonicalDirectory(source), destination))
            throw new WorkError('INVALID_OPERATION', '不能将文件夹导入其自身或子目录')
          let candidate = join(destination, basename(source))
          const extension = sourceStat.isDirectory() ? '' : extname(source)
          const stem = basename(source).slice(0, basename(source).length - extension.length)
          let number = 1
          const chooseTarget = () => {
            while (existsSync(candidate)) {
              candidate = join(destination, `${stem} (${number++})${extension}`)
            }
          }
          chooseTarget()
          await copyTree(source, staging, running)
          running.controller.signal.throwIfAborted()
          // Revalidate the destination after copying; a disconnected disk/changed path cannot commit.
          if (stageDirectory(get(project.id), input.stage, input.directory) !== destination)
            throw new WorkError('DIRECTORY_UNAVAILABLE', '目标目录已改变')
          chooseTarget()
          if (sourceStat.isDirectory()) publishFolder(staging, candidate)
          else {
            // Exclusive reservation works on removable FAT/exFAT volumes as well as NTFS/APFS.
            // The sidecar keeps a reserved/incomplete destination hidden after an interrupted commit.
            marker = join(destination, `.moondot-pending-${randomUUID()}`)
            writeFileSync(marker, basename(candidate), { flag: 'wx' })
            const descriptor = openSync(candidate, 'wx')
            published = candidate
            closeSync(descriptor)
            renameSync(staging, candidate)
          }
          published = candidate
          const timestamp = new Date().toISOString()
          sqlite.transaction(() => {
            forget(project.id, fileKey(project.rootDirectory, candidate))
            rememberTree(project, candidate, timestamp)
          })()
          job.completed++
          published = undefined
        } catch (error) {
          if (published) {
            try {
              rmSync(published, { recursive: true, force: true })
            } catch (rollback) {
              // Leave the sidecar in place when a disconnected/read-only disk prevents cleanup.
              marker = undefined
              report(rollback)
            }
          }
          if (!running.controller.signal.aborted) {
            job.failures.push({ name: basename(source), message: message(error) })
            report(error)
          }
        } finally {
          if (marker) {
            try {
              unlinkSync(marker)
            } catch (error) {
              report(error)
            }
          }
          try {
            await rm(staging, { recursive: true, force: true })
          } catch (error) {
            report(error)
          }
        }
      }
    } finally {
      job.current = ''
      job.state = running.controller.signal.aborted ? 'cancelled' : 'completed'
    }
  }
  return {
    busy,
    async dispose() {
      for (const running of jobs.values()) running.controller.abort()
      await Promise.allSettled([...jobs.values()].map((running) => running.promise))
    },
    chooseDirectory: () => host.chooseDirectory(),
    chooseImports: ({ folders }: WorkInput<'chooseImports'>) => host.chooseImports(folders),
    checkDirectory: ({ directory }: WorkInput<'checkDirectory'>) => {
      const canonical = canonicalDirectory(directory)
      assertWritable(canonical)
      return { directory: canonical }
    },
    files,
    createFolder: (input: WorkInput<'createFolder'>) => {
      idle(input.projectId)
      const { project, directory } = locate(input, true)
      const target = join(directory, fileName(input.name))
      if (existsSync(target)) throw new WorkError('CONFLICT', '同名文件或文件夹已存在')
      mkdirSync(target)
      try {
        insert.run(project.id, fileKey(project.rootDirectory, target), new Date().toISOString())
      } catch (error) {
        rmdirSync(target)
        throw error
      }
      return { id: project.id }
    },
    renameFile: (input: WorkInput<'renameFile'>) => {
      idle(input.projectId)
      const { project, directory } = locate(input, true)
      const source = existingEntry(directory, input.name)
      if (input.name === input.newName) return { id: project.id }
      const target = join(directory, fileName(input.newName))
      if (existsSync(target)) throw new WorkError('CONFLICT', '同名文件或文件夹已存在')
      const oldKey = fileKey(project.rootDirectory, source),
        newKey = fileKey(project.rootDirectory, target)
      renameSync(source, target)
      try {
        sqlite.transaction(() => {
          const rows = sqlite
            .prepare('SELECT path, added_at FROM project_files WHERE project_id = ?')
            .all(project.id) as { path: string; added_at: string }[]
          for (const row of rows)
            if (row.path === oldKey || row.path.startsWith(oldKey + '/')) {
              sqlite
                .prepare('UPDATE project_files SET path = ? WHERE project_id = ? AND path = ?')
                .run(newKey + row.path.slice(oldKey.length), project.id, row.path)
            }
        })()
      } catch (error) {
        renameSync(target, source)
        throw error
      }
      return { id: project.id }
    },
    trashFile: async (input: WorkInput<'trashFile'>) => {
      idle(input.projectId)
      const { project, directory } = locate(input, true)
      const target = existingEntry(directory, input.name)
      locks.add(project.id)
      try {
        try {
          await host.trash(target)
        } catch (error) {
          report(error)
          throw new WorkError(
            'INVALID_OPERATION',
            '无法移入系统回收站，文件已保留。请在资源管理器 / Finder 中处理',
          )
        }
        sqlite.transaction(() => forget(project.id, fileKey(project.rootDirectory, target)))()
      } finally {
        locks.delete(project.id)
      }
      return { id: project.id }
    },
    openFolder: async (input: WorkInput<'openFolder'>) => {
      const { directory } = locate(input)
      if (await host.open(directory))
        throw new WorkError('DIRECTORY_UNAVAILABLE', '无法打开此目录，请检查系统文件管理器')
      return { id: input.projectId }
    },
    revealFile: (input: WorkInput<'revealFile'>) => {
      const { directory } = locate(input)
      host.reveal(existingEntry(directory, input.name))
      return { id: input.projectId }
    },
    startImport: (input: WorkInput<'startImport'>) => {
      idle(input.projectId)
      const { project, directory } = locate(input, true)
      for (const [id, running] of jobs) if (running.job.state !== 'running') jobs.delete(id)
      const job: ImportJob = {
        id: randomUUID(),
        projectId: project.id,
        state: 'running',
        total: input.sources.length,
        completed: 0,
        current: '',
        bytes: 0,
        failures: [],
      }
      const running: Running = { job, controller: new AbortController() }
      jobs.set(job.id, running)
      running.promise = importBatch(input, running, project, directory)
      return structuredClone(job)
    },
    importStatus: ({ id }: WorkInput<'importStatus'>) => structuredClone(getJob(id).job),
    cancelImport: ({ id }: WorkInput<'cancelImport'>) => {
      const running = getJob(id)
      running.controller.abort()
      return structuredClone(running.job)
    },
  }
}
