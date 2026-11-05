import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  workSchemas,
  preferencesSchema,
  type Project,
  type Stage,
  type Task,
  type Template,
  type Note,
  type Activity,
  type Preferences,
  type WorkMethod,
  type WorkInput,
  type WorkOutputs,
  type Mutation,
  type SearchHit,
} from '../../shared/work'
import { WorkError } from './work-error'
import { rankBetween } from './rank'

type Service = { [K in WorkMethod]: (input: WorkInput<K>) => WorkOutputs[K] }
type ProjectRow = Omit<Project, 'progress' | 'health' | 'currentStage' | 'tags'> & { tags: string }
const projectColumns = `p.id,p.code,p.name,p.artist,p.type,p.genre,p.bpm,p.musical_key AS musicalKey,p.due_date AS dueDate,p.participants,p.description,p.tags,p.color,p.cover,p.status,p.created_at AS createdAt,p.updated_at AS updatedAt,p.deleted_at AS deletedAt`
const taskColumns = `t.id,t.project_id AS projectId,t.stage_id AS stageId,t.parent_id AS parentId,t.title,t.description,t.status,t.priority,t.due_date AS dueDate,t.assignee,t.rank,t.completed_at AS completedAt,t.updated_at AS updatedAt,t.deleted_at AS deletedAt,p.name AS projectName,p.color AS projectColor,p.status AS projectStatus,
 (SELECT count(*) FROM notes WHERE task_id=t.id) AS noteCount,
 (SELECT count(*) FROM tasks c WHERE c.parent_id=t.id AND c.deleted_at IS NULL AND c.status<>'canceled') AS childCount,
 (SELECT count(*) FROM tasks c WHERE c.parent_id=t.id AND c.deleted_at IS NULL AND c.status='done') AS childDone`
const noteColumns = `id,project_id AS projectId,task_id AS taskId,body,author,created_at AS createdAt,updated_at AS updatedAt`
const now = () => new Date().toISOString()
function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const like = (query: string) => query.replace(/[\\%_]/g, '\\$&')

export function createWorkService(db: Database.Database, actor: () => string): Service {
  let revision = 0
  const undo = new Map<
    string,
    { expires: number; revision: number; apply: () => void; projectId: string }
  >()
  const getProject = (id: string, allowDeleted = false) => {
    const row = db.prepare(`SELECT ${projectColumns} FROM projects p WHERE p.id=?`).get(id) as
      ProjectRow | undefined
    if (!row || (!allowDeleted && row.deletedAt))
      throw new WorkError('NOT_FOUND', '项目不存在或已移入回收站')
    return row
  }
  const editable = (id: string) => {
    const project = getProject(id)
    if (project.status === 'archived')
      throw new WorkError('READ_ONLY', '已归档项目只读，请先取消归档')
    return project
  }
  const getTask = (id: string, allowDeleted = false) => {
    const row = db
      .prepare(
        `SELECT ${taskColumns} FROM tasks t JOIN projects p ON p.id=t.project_id WHERE t.id=?`,
      )
      .get(id) as Task | undefined
    if (!row || (!allowDeleted && row.deletedAt))
      throw new WorkError('NOT_FOUND', '任务不存在或已删除')
    getProject(row.projectId)
    return row
  }
  const log = (projectId: string, action: string) => {
    db.prepare('INSERT INTO activity_logs VALUES (?,?,?,?,?)').run(
      randomUUID(),
      projectId,
      action,
      actor() || '本机用户',
      now(),
    )
    db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(now(), projectId)
  }
  const mutate = (
    projectId: string,
    id: string,
    action: string,
    write: () => void,
    reverse?: () => void,
  ): Mutation => {
    db.transaction(() => {
      write()
      log(projectId, action)
    })()
    revision++
    for (const [key, value] of undo)
      if (value.expires < Date.now() || value.revision !== revision) undo.delete(key)
    if (!reverse) return { id }
    const token = randomUUID()
    undo.set(token, { expires: Date.now() + 5000, revision, apply: reverse, projectId })
    return { id, undoToken: token }
  }
  const stages = (projectId: string): Stage[] => {
    const rows = db
      .prepare(
        'SELECT id,project_id AS projectId,name,weight,position,status FROM project_stages WHERE project_id=? ORDER BY position',
      )
      .all(projectId) as Omit<Stage, 'completion'>[]
    const counts = db
      .prepare(
        "SELECT stage_id AS id,count(*) AS total,sum(status='done') AS done FROM tasks WHERE project_id=? AND deleted_at IS NULL AND status<>'canceled' AND parent_id IS NULL GROUP BY stage_id",
      )
      .all(projectId) as { id: string; total: number; done: number }[]
    return rows.map((stage) => {
      const count = counts.find((item) => item.id === stage.id)
      return {
        ...stage,
        completion: count
          ? count.done / count.total
          : stage.status === 'done'
            ? 1
            : stage.status === 'doing'
              ? 0.5
              : 0,
      }
    })
  }
  const enrich = (row: ProjectRow): Project => {
    const phase = stages(row.id),
      sum = phase.reduce((total, stage) => total + stage.weight, 0)
    const progress = sum
      ? Math.round(
          (phase.reduce((total, stage) => total + stage.weight * stage.completion, 0) / sum) * 100,
        )
      : 0
    const date = today(),
      days = row.dueDate
        ? (Date.parse(`${row.dueDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000
        : Infinity
    const overdueTask = db
      .prepare(
        "SELECT 1 FROM tasks WHERE project_id=? AND deleted_at IS NULL AND status NOT IN ('done','canceled') AND due_date<>'' AND due_date<? LIMIT 1",
      )
      .get(row.id, date)
    const closed = row.status === 'completed' || row.status === 'archived'
    return {
      ...row,
      tags: JSON.parse(row.tags),
      progress,
      currentStage: phase.find((stage) => stage.completion < 1)?.name ?? '已完成',
      health: closed
        ? 'normal'
        : days < 0
          ? 'overdue'
          : overdueTask || (days <= 7 && progress < 70)
            ? 'risk'
            : 'normal',
    }
  }
  const listTasks = (projectId: string | null, trash = false) =>
    db
      .prepare(
        `SELECT ${taskColumns} FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.deleted_at IS NULL AND (? IS NULL OR t.project_id=?) AND t.deleted_at IS ${trash ? 'NOT ' : ''}NULL ORDER BY t.rank,t.id`,
      )
      .all(projectId, projectId) as Task[]
  const templates = (): Template[] =>
    (
      db.prepare('SELECT * FROM stage_templates ORDER BY rowid').all() as {
        id: string
        name: string
        stages: string
      }[]
    ).map((row) => ({ ...row, stages: JSON.parse(row.stages) }))
  const preferences = (): Preferences => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key='preferences'").get() as
      { value: string } | undefined
    return row
      ? preferencesSchema.parse(JSON.parse(row.value))
      : { projectView: 'cards', taskView: 'board', defaultTemplateId: null }
  }
  const descendants = (id: string) =>
    (
      db
        .prepare(
          'WITH RECURSIVE tree(id) AS (SELECT id FROM tasks WHERE id=? UNION ALL SELECT t.id FROM tasks t JOIN tree ON t.parent_id=tree.id) SELECT id FROM tree',
        )
        .all(id) as { id: string }[]
    ).map((row) => row.id)
  const parentValid = (parentId: string | null, projectId: string, taskId?: string) => {
    if (!parentId) return
    const parent = getTask(parentId)
    if (parent.projectId !== projectId || parent.parentId || parent.id === taskId)
      throw new WorkError('INVALID_OPERATION', '子任务只能关联同项目的顶层任务')
    if (taskId && db.prepare('SELECT 1 FROM tasks WHERE parent_id=?').get(taskId))
      throw new WorkError('INVALID_OPERATION', '含子任务的任务不能设为子任务')
  }
  const service: Service = {
    templates,
    saveTemplate(input) {
      const value = workSchemas.saveTemplate.parse(input),
        id = value.id ?? randomUUID()
      if (value.id && !templates().some((item) => item.id === id))
        throw new WorkError('NOT_FOUND', '模板不存在')
      const sum = value.stages.reduce((total, stage) => total + stage.weight, 0)
      db.prepare(
        'INSERT INTO stage_templates VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,stages=excluded.stages',
      ).run(
        id,
        value.name,
        JSON.stringify(
          value.stages.map((stage) => ({ ...stage, weight: (stage.weight / sum) * 100 })),
        ),
      )
      revision++
      return { id }
    },
    deleteTemplate({ id }) {
      if (templates().length <= 1) throw new WorkError('INVALID_OPERATION', '至少保留一个阶段模板')
      if (!templates().some((item) => item.id === id))
        throw new WorkError('NOT_FOUND', '模板不存在')
      db.transaction(() => {
        db.prepare('DELETE FROM stage_templates WHERE id=?').run(id)
        const prefs = preferences()
        if (prefs.defaultTemplateId === id)
          service.savePreferences({ ...prefs, defaultTemplateId: null })
      })()
      revision++
      return { id }
    },
    projects(input) {
      const rows = (
        db
          .prepare(
            `SELECT ${projectColumns} FROM projects p WHERE p.deleted_at IS ${input.trash ? 'NOT ' : ''}NULL`,
          )
          .all() as ProjectRow[]
      )
        .map(enrich)
        .filter(
          (project) =>
            (!input.status || project.status === input.status) &&
            (!input.tag || project.tags.includes(input.tag)) &&
            (!input.stage || project.currentStage === input.stage) &&
            (!input.dueBefore || (project.dueDate && project.dueDate <= input.dueBefore)) &&
            (!input.query ||
              `${project.name} ${project.artist} ${project.code} ${project.tags.join(' ')}`
                .toLocaleLowerCase()
                .includes(input.query.toLocaleLowerCase())),
        )
      rows.sort((a, b) =>
        input.sort === 'due'
          ? (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
            b.updatedAt.localeCompare(a.updatedAt)
          : input.sort === 'progress'
            ? b.progress - a.progress || b.updatedAt.localeCompare(a.updatedAt)
            : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      )
      return {
        items: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
        total: rows.length,
      }
    },
    project({ id }) {
      return {
        project: enrich(getProject(id)),
        stages: stages(id),
        tasks: listTasks(id),
        notes: db
          .prepare(
            `SELECT ${noteColumns} FROM notes WHERE project_id=? AND (task_id IS NULL OR task_id IN (SELECT id FROM tasks WHERE deleted_at IS NULL)) ORDER BY created_at DESC`,
          )
          .all(id) as Note[],
        activity: db
          .prepare(
            'SELECT id,action,actor,created_at AS createdAt FROM activity_logs WHERE project_id=? ORDER BY rowid DESC LIMIT 100',
          )
          .all(id) as Activity[],
      }
    },
    saveProject(input) {
      const value = workSchemas.saveProject.parse(input),
        id = value.id ?? randomUUID()
      if (value.id) editable(id)
      if (value.status === 'archived') throw new WorkError('INVALID_OPERATION', '请使用归档操作')
      const stamp = now(),
        template = value.id
          ? undefined
          : (templates().find(
              (item) => item.id === (value.templateId ?? preferences().defaultTemplateId),
            ) ?? templates()[0])
      if (
        !value.id &&
        value.templateId &&
        !templates().some((item) => item.id === value.templateId)
      )
        throw new WorkError('NOT_FOUND', '模板不存在，请重新选择')
      return mutate(id, id, value.id ? '更新项目信息' : '创建项目', () => {
        const fields = { ...value, id, tags: JSON.stringify([...new Set(value.tags)]), stamp }
        if (value.id)
          db.prepare(
            'UPDATE projects SET name=@name,artist=@artist,type=@type,genre=@genre,bpm=@bpm,musical_key=@musicalKey,due_date=@dueDate,participants=@participants,description=@description,tags=@tags,color=@color,cover=@cover,status=@status,updated_at=@stamp WHERE id=@id',
          ).run(fields)
        else {
          db.prepare(
            `INSERT INTO projects VALUES (@id,@code,@name,@artist,@type,@genre,@bpm,@musicalKey,@dueDate,@participants,@description,@tags,@color,@cover,@status,@stamp,@stamp,NULL)`,
          ).run({
            ...fields,
            code: `MD-${stamp.slice(0, 10).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`,
          })
          const insert = db.prepare(
            'INSERT INTO project_stages(id,project_id,name,weight,position) VALUES (?,?,?,?,?)',
          )
          template!.stages.forEach((stage, index) =>
            insert.run(randomUUID(), id, stage.name, stage.weight, index),
          )
          if (value.initialTasks) {
            const stage = stages(id)[0]!
            for (const title of ['确认创作方向', '整理参考资料'])
              service.saveTask({
                projectId: id,
                stageId: stage.id,
                parentId: null,
                title,
                description: '',
                status: 'todo',
                priority: 'medium',
                dueDate: '',
                assignee: '',
              })
          }
        }
      })
    },
    projectState({ id, status }) {
      const project = getProject(id)
      return mutate(
        id,
        id,
        status === 'archived' ? '归档项目' : '修改项目状态',
        () => db.prepare('UPDATE projects SET status=? WHERE id=?').run(status, id),
        () => db.prepare('UPDATE projects SET status=? WHERE id=?').run(project.status, id),
      )
    },
    trashProject({ id }) {
      editable(id)
      return mutate(
        id,
        id,
        '移入回收站',
        () => db.prepare('UPDATE projects SET deleted_at=? WHERE id=?').run(now(), id),
        () => db.prepare('UPDATE projects SET deleted_at=NULL WHERE id=?').run(id),
      )
    },
    restoreProject({ id }) {
      const project = getProject(id, true)
      if (!project.deletedAt) throw new WorkError('CONFLICT', '项目不在回收站')
      return mutate(id, id, '恢复项目', () =>
        db.prepare('UPDATE projects SET deleted_at=NULL WHERE id=?').run(id),
      )
    },
    purgeProject({ id, name }) {
      const project = getProject(id, true)
      if (!project.deletedAt || project.name !== name)
        throw new WorkError('INVALID_OPERATION', '请从回收站输入完整项目名确认彻底删除')
      db.transaction(() => {
        db.prepare('UPDATE tasks SET parent_id=NULL WHERE project_id=?').run(id)
        db.prepare('DELETE FROM projects WHERE id=?').run(id)
      })()
      revision++
      return { id }
    },
    stageState({ id, status }) {
      const stage = db
        .prepare('SELECT project_id AS projectId FROM project_stages WHERE id=?')
        .get(id) as { projectId: string } | undefined
      if (!stage) throw new WorkError('NOT_FOUND', '阶段不存在')
      editable(stage.projectId)
      return mutate(stage.projectId, id, '修改阶段状态', () =>
        db.prepare('UPDATE project_stages SET status=? WHERE id=?').run(status, id),
      )
    },
    tasks(input) {
      return listTasks(input.projectId, input.trash).filter(
        (task) =>
          (!input.status || task.status === input.status) &&
          (!input.priority || task.priority === input.priority) &&
          (!input.stageId || task.stageId === input.stageId) &&
          (!input.dueBefore || (task.dueDate && task.dueDate <= input.dueBefore)) &&
          (!input.query ||
            `${task.title} ${task.assignee}`.toLowerCase().includes(input.query.toLowerCase())),
      )
    },
    saveTask(input) {
      const value = workSchemas.saveTask.parse(input),
        id = value.id ?? randomUUID()
      editable(value.projectId)
      const previous = value.id ? getTask(id) : undefined
      if (previous && previous.projectId !== value.projectId)
        throw new WorkError('INVALID_OPERATION', '不能跨项目移动任务')
      if (
        value.stageId &&
        !db
          .prepare('SELECT 1 FROM project_stages WHERE id=? AND project_id=?')
          .get(value.stageId, value.projectId)
      )
        throw new WorkError('INVALID_OPERATION', '阶段不属于当前项目')
      parentValid(value.parentId, value.projectId, id)
      const stamp = now(),
        last = db
          .prepare(
            'SELECT rank FROM tasks WHERE project_id=? AND status=? AND deleted_at IS NULL ORDER BY rank DESC LIMIT 1',
          )
          .get(value.projectId, value.status) as { rank: string } | undefined
      return mutate(value.projectId, id, previous ? '更新任务' : '创建任务', () => {
        const args = {
          ...value,
          id,
          stamp,
          completedAt: value.status === 'done' ? (previous?.completedAt ?? stamp) : null,
          rank:
            previous?.status === value.status
              ? previous.rank
              : rankBetween(last?.rank ?? null, null),
        }
        if (previous)
          db.prepare(
            'UPDATE tasks SET stage_id=@stageId,parent_id=@parentId,title=@title,description=@description,status=@status,priority=@priority,due_date=@dueDate,assignee=@assignee,rank=@rank,completed_at=@completedAt,updated_at=@stamp WHERE id=@id',
          ).run(args)
        else
          db.prepare(
            'INSERT INTO tasks VALUES (@id,@projectId,@stageId,@parentId,@title,@description,@status,@priority,@dueDate,@assignee,@rank,@completedAt,@stamp,@stamp,NULL)',
          ).run(args)
      })
    },
    moveTask({ id, status, beforeId }) {
      const task = getTask(id)
      editable(task.projectId)
      const list = listTasks(task.projectId).filter(
        (item) => item.id !== id && item.status === status,
      )
      const index = beforeId ? list.findIndex((item) => item.id === beforeId) : list.length
      if (index < 0) throw new WorkError('CONFLICT', '排序位置已变化，请刷新后重试')
      const rank = rankBetween(list[index - 1]?.rank ?? null, list[index]?.rank ?? null)
      return mutate(
        task.projectId,
        id,
        '移动任务',
        () =>
          db
            .prepare('UPDATE tasks SET status=?,rank=?,completed_at=?,updated_at=? WHERE id=?')
            .run(status, rank, status === 'done' ? (task.completedAt ?? now()) : null, now(), id),
        () =>
          db
            .prepare('UPDATE tasks SET status=?,rank=?,completed_at=?,updated_at=? WHERE id=?')
            .run(task.status, task.rank, task.completedAt, now(), id),
      )
    },
    trashTask({ id }) {
      const task = getTask(id)
      editable(task.projectId)
      const ids = descendants(id).filter((key) => !getTask(key, true).deletedAt)
      // A deletion timestamp also identifies a subtree batch. Keep it unique even
      // when two deletions happen in the same millisecond or the clock moves back.
      const latest = db
        .prepare('SELECT max(deleted_at) AS stamp FROM tasks WHERE project_id=?')
        .get(task.projectId) as { stamp: string | null }
      const stamp = new Date(
        Math.max(Date.now(), latest.stamp ? Date.parse(latest.stamp) + 1 : 0),
      ).toISOString()
      return mutate(
        task.projectId,
        id,
        '删除任务及子任务',
        () => {
          for (const key of ids)
            db.prepare('UPDATE tasks SET deleted_at=?,updated_at=? WHERE id=?').run(
              stamp,
              stamp,
              key,
            )
        },
        () => {
          for (const key of ids)
            db.prepare('UPDATE tasks SET deleted_at=NULL,updated_at=? WHERE id=?').run(now(), key)
        },
      )
    },
    restoreTask({ id }) {
      const task = getTask(id, true)
      editable(task.projectId)
      if (!task.deletedAt) throw new WorkError('CONFLICT', '任务未删除')
      if (task.parentId && getTask(task.parentId, true).deletedAt)
        throw new WorkError('INVALID_OPERATION', '请先恢复父任务')
      const ids = descendants(id).filter((key) => getTask(key, true).deletedAt === task.deletedAt)
      return mutate(task.projectId, id, '恢复任务', () => {
        for (const key of ids) {
          const restored = getTask(key, true)
          const last = db
            .prepare(
              'SELECT rank FROM tasks WHERE project_id=? AND status=? AND deleted_at IS NULL ORDER BY rank DESC LIMIT 1',
            )
            .get(restored.projectId, restored.status) as { rank: string } | undefined
          db.prepare('UPDATE tasks SET deleted_at=NULL,rank=?,updated_at=? WHERE id=?').run(
            rankBetween(last?.rank ?? null, null),
            now(),
            key,
          )
        }
      })
    },
    saveNote(input) {
      const value = workSchemas.saveNote.parse(input)
      editable(value.projectId)
      if (value.taskId && getTask(value.taskId).projectId !== value.projectId)
        throw new WorkError('INVALID_OPERATION', '备注任务不属于当前项目')
      if (
        value.id &&
        !db
          .prepare('SELECT 1 FROM notes WHERE id=? AND project_id=? AND task_id IS ?')
          .get(value.id, value.projectId, value.taskId)
      )
        throw new WorkError('NOT_FOUND', '备注不存在')
      const id = value.id ?? randomUUID(),
        stamp = now()
      return mutate(value.projectId, id, value.id ? '编辑备注' : '添加备注', () => {
        if (value.id)
          db.prepare('UPDATE notes SET body=?,updated_at=? WHERE id=?').run(value.body, stamp, id)
        else
          db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?)').run(
            id,
            value.projectId,
            value.taskId,
            value.body,
            actor() || '本机用户',
            stamp,
            stamp,
          )
      })
    },
    deleteNote({ id }) {
      const note = db.prepare(`SELECT ${noteColumns} FROM notes WHERE id=?`).get(id) as
        Note | undefined
      if (!note) throw new WorkError('NOT_FOUND', '备注不存在')
      editable(note.projectId)
      if (note.taskId) getTask(note.taskId)
      return mutate(note.projectId, id, '删除备注', () =>
        db.prepare('DELETE FROM notes WHERE id=?').run(id),
      )
    },
    search({ query, includeArchived }) {
      const pattern = `%${like(query)}%`,
        prefix = `${like(query)}%`,
        fts = [...query].length >= 3
      const clause = fts
        ? 'search_index MATCH @match'
        : "(s.title LIKE @pattern ESCAPE '\\' OR s.body LIKE @pattern ESCAPE '\\')"
      return db
        .prepare(
          `SELECT s.entity_id AS id,s.kind,s.project_id AS projectId,s.task_id AS taskId,s.title,substr(s.body,1,180) AS excerpt,p.name AS projectName
       FROM search_index s JOIN projects p ON p.id=s.project_id LEFT JOIN tasks t ON t.id=s.task_id
       WHERE ${clause} AND p.deleted_at IS NULL AND (@archived=1 OR p.status<>'archived') AND (s.task_id IS NULL OR t.deleted_at IS NULL)
       ORDER BY CASE WHEN s.title LIKE @prefix ESCAPE '\\' THEN 0 WHEN s.title LIKE @pattern ESCAPE '\\' THEN 1 ELSE 2 END,p.updated_at DESC,s.entity_id LIMIT 50`,
        )
        .all({
          match: `"${query.replaceAll('"', '""')}"`,
          pattern,
          prefix,
          archived: includeArchived ? 1 : 0,
        }) as SearchHit[]
    },
    preferences,
    savePreferences(input) {
      const value = preferencesSchema.parse(input)
      if (
        value.defaultTemplateId &&
        !templates().some((item) => item.id === value.defaultTemplateId)
      )
        throw new WorkError('NOT_FOUND', '默认模板不存在')
      db.prepare(
        "INSERT INTO app_settings VALUES ('preferences',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
      ).run(JSON.stringify(value), now())
      revision++
      return value
    },
    undo({ token }) {
      const entry = undo.get(token)
      if (!entry || entry.expires < Date.now() || entry.revision !== revision)
        throw new WorkError('CONFLICT', '撤销已过期或数据已变化，请使用恢复操作')
      getProject(entry.projectId, true)
      db.transaction(() => {
        entry.apply()
        log(entry.projectId, '撤销上一次操作')
      })()
      revision++
      undo.delete(token)
      return { id: entry.projectId }
    },
  }
  return service
}
