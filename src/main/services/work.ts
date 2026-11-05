import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmdirSync } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { phases, projectDraftSchema, type Project, type WorkInput } from '../../shared/work'
import {
  assertWritable,
  canonicalDirectory,
  contains,
  fileName,
  stageDirectory,
} from './project-paths'
import { WorkError } from './work-error'

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
interface Row {
  id: string
  data: string
  root_directory: string
  status: Project['status']
  created_at: string
  updated_at: string
  deleted_at: string | null
}
const unpack = (row: Row): Project => ({
  ...JSON.parse(row.data),
  id: row.id,
  rootDirectory: row.root_directory,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
})
export function createWorkService(
  sqlite: Database.Database,
  clock = () => Date.now(),
  isBusy: (id: string) => boolean = () => false,
  getDefaultDirectory?: () => string,
  trashDirectory?: (path: string) => Promise<void>,
) {
  const now = () => new Date(clock()).toISOString()
  const deleting = new Set<string>()
  function cleanup() {
    return sqlite
      .prepare(
        `DELETE FROM projects WHERE deleted_at IS NOT NULL AND deleted_at <= ?
        AND id NOT IN (SELECT value FROM json_each(?))`,
      )
      .run(new Date(clock() - RETENTION_MS).toISOString(), JSON.stringify([...deleting])).changes
  }
  cleanup()
  function get(id: string, allowDeleted = false) {
    if (deleting.has(id)) throw new WorkError('CONFLICT', '项目文件正在删除，请等待完成')
    cleanup()
    const row = sqlite.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined
    if (!row || (!allowDeleted && row.deleted_at))
      throw new WorkError('NOT_FOUND', '项目不存在或已进入回收站')
    return unpack(row)
  }
  function idle(id: string) {
    if (isBusy(id)) throw new WorkError('CONFLICT', '文件操作进行中，请等待完成或先取消导入')
  }
  function assertUnclaimed(directory: string, except?: string) {
    const rows = sqlite.prepare('SELECT id, root_directory FROM projects').all() as {
      id: string
      root_directory: string
    }[]
    for (const row of rows) {
      if (row.id === except) continue
      let existing = resolve(row.root_directory)
      if (existsSync(existing)) existing = canonicalDirectory(existing)
      if (contains(existing, directory) || contains(directory, existing))
        throw new WorkError(
          'CONFLICT',
          '此目录已被其他项目占用，项目目录不能共用或嵌套（包括回收站项目）',
        )
    }
  }
  function validateRoot(directory: string, except?: string) {
    const root = canonicalDirectory(directory)
    assertUnclaimed(root, except)
    const stub = { rootDirectory: root } as Project
    for (const phase of phases) stageDirectory(stub, phase.key, '')
    assertWritable(root)
    for (const phase of phases) assertWritable(join(root, phase.folder))
    return root
  }
  function projects(input: WorkInput<'projects'>) {
    cleanup()
    const query = input.query.toLocaleLowerCase()
    const rows = sqlite
      .prepare(
        `SELECT * FROM projects WHERE deleted_at IS ${input.trash ? 'NOT ' : ''}NULL ORDER BY updated_at DESC, id`,
      )
      .all() as Row[]
    const items = rows
      .map(unpack)
      .filter(
        (project) =>
          (!input.status || project.status === input.status) &&
          (!query || searchable(project).toLocaleLowerCase().includes(query)),
      )
    return {
      total: items.length,
      items: items.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
    }
  }
  function searchable(project: Project) {
    return [
      project.name,
      project.description,
      ...project.stages.flatMap((stage) => Object.values(stage.people).flat()),
    ].join('\n')
  }
  return {
    defaultProjectDirectory: () => {
      if (!getDefaultDirectory)
        throw new WorkError('DIRECTORY_UNAVAILABLE', '系统文档目录不可用，请选择其他存放位置')
      return { directory: getDefaultDirectory() }
    },
    get,
    cleanup,
    idle,
    validateRoot,
    project: ({ id }: WorkInput<'project'>) => get(id),
    projects,
    saveProject: (input: WorkInput<'saveProject'>) => {
      const draft = projectDraftSchema.parse(input)
      const { id, parentDirectory: selectedDirectory, ...data } = draft
      if (id) {
        get(id)
        sqlite
          .prepare('UPDATE projects SET data = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(data), now(), id)
        return { id }
      }
      const parentDirectory = selectedDirectory || getDefaultDirectory?.()
      if (!parentDirectory) throw new WorkError('INVALID_OPERATION', '请选择项目存放位置')
      cleanup()
      const parent = canonicalDirectory(parentDirectory)
      assertWritable(parent)
      // Project names remain free text; only the initial directory name is made portable.
      let folder = data.name
        .replace(/[<>:"/\\|?*]/g, '_')
        .split('')
        .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
        .join('')
        .replace(/[. ]+$/g, '')
        .slice(0, 100)
      if (!folder) folder = '项目'
      try {
        fileName(folder)
      } catch {
        folder = `项目-${folder}`
      }
      const root = join(parent, folder)
      assertUnclaimed(root)
      if (existsSync(root))
        throw new WorkError('CONFLICT', '存放位置已有同名目录，请选择其他位置或修改项目名称')
      const created: string[] = []
      const projectId = randomUUID()
      try {
        mkdirSync(root)
        created.push(root)
        for (const phase of phases) {
          const directory = join(root, phase.folder)
          mkdirSync(directory)
          created.push(directory)
        }
        sqlite
          .prepare(
            'INSERT INTO projects (id, data, root_directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(projectId, JSON.stringify(data), root, now(), now())
      } catch (error) {
        // Only remove empty directories created by this operation; never delete unrelated files.
        for (const directory of created.reverse()) {
          try {
            if (!readdirSync(directory).length) rmdirSync(directory)
          } catch {
            /* Keep externally changed directories. */
          }
        }
        throw error
      }
      return { id: projectId }
    },
    projectState: ({ id, status }: WorkInput<'projectState'>) => {
      get(id)
      sqlite
        .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
        .run(status, now(), id)
      return { id }
    },
    trashProject: ({ id }: WorkInput<'trashProject'>) => {
      get(id)
      idle(id)
      sqlite
        .prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?')
        .run(now(), now(), id)
      return { id }
    },
    restoreProject: ({ id, directory }: WorkInput<'restoreProject'>) => {
      const project = get(id, true)
      if (!project.deletedAt) throw new WorkError('INVALID_OPERATION', '项目不在回收站中')
      const root = validateRoot(directory || project.rootDirectory, id)
      sqlite
        .prepare(
          'UPDATE projects SET root_directory = ?, deleted_at = NULL, updated_at = ? WHERE id = ?',
        )
        .run(root, now(), id)
      return { id }
    },
    purgeProject: ({ id, name }: WorkInput<'purgeProject'>) => {
      const project = get(id, true)
      idle(id)
      if (!project.deletedAt || project.name !== name)
        throw new WorkError('INVALID_OPERATION', '请在回收站中输入完整项目名称以删除记录')
      sqlite.prepare('DELETE FROM projects WHERE id = ?').run(id)
      return { id }
    },
    deleteProjectFiles: async ({ id, name }: WorkInput<'deleteProjectFiles'>) => {
      const project = get(id, true)
      idle(id)
      if (!project.deletedAt || project.name !== name)
        throw new WorkError('INVALID_OPERATION', '请在回收站中输入完整项目名称以删除本地文件')
      const root = canonicalDirectory(project.rootDirectory)
      if (resolve(root) !== resolve(project.rootDirectory) || dirname(root) === root)
        throw new WorkError('DIRECTORY_UNAVAILABLE', '项目目录指向已改变或路径不安全，无法删除')
      assertUnclaimed(root, id)
      if (!trashDirectory)
        throw new WorkError('INVALID_OPERATION', '系统回收站不可用，项目记录和文件已保留')
      deleting.add(id)
      try {
        try {
          await trashDirectory(root)
        } catch {
          throw new WorkError(
            'INVALID_OPERATION',
            '无法移入系统回收站，项目记录已保留，请检查磁盘连接、权限或文件占用后重试',
          )
        }
        // A resolved shell operation is not proof that the source actually disappeared.
        let remains = true
        try {
          await lstat(root)
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code === 'ENOENT') remains = false
          else
            throw new WorkError(
              'DIRECTORY_UNAVAILABLE',
              '无法确认项目目录是否已删除，项目记录已保留，请检查目录及权限',
            )
        }
        if (remains)
          throw new WorkError(
            'INVALID_OPERATION',
            '项目目录仍然存在，未完成删除。项目记录已保留，请关闭正在使用项目文件的程序后重试',
          )
        sqlite.prepare('DELETE FROM projects WHERE id = ?').run(id)
        return { id }
      } finally {
        deleting.delete(id)
      }
    },
    relocateProject: ({ id, directory }: WorkInput<'relocateProject'>) => {
      get(id)
      idle(id)
      const root = validateRoot(directory, id)
      sqlite
        .prepare('UPDATE projects SET root_directory = ?, updated_at = ? WHERE id = ?')
        .run(root, now(), id)
      return { id }
    },
    search: ({ query }: WorkInput<'search'>) =>
      projects({ query, status: '', trash: false, page: 1, pageSize: 50 }).items.map((project) => ({
        id: project.id,
        title: project.name,
        excerpt: searchable(project).slice(0, 400),
      })),
  }
}
