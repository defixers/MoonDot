import {
  constants,
  accessSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  unlinkSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { phases, type PhaseKey, type Project } from '../../shared/work'
import { resolveInside } from '../infra/paths'
import { WorkError } from './work-error'

export function fileName(name: string) {
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[<>:"/\\|?*]/.test(name) ||
    [...name].some((char) => char.charCodeAt(0) < 32) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ||
    name.toLowerCase().startsWith('.moondot-')
  )
    throw new WorkError('INVALID_OPERATION', '名称包含不可用字符、系统保留名称或结尾空格/句点')
  return name
}
export function contains(parent: string, child: string) {
  const suffix = relative(parent, child)
  return suffix === '' || (suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix))
}
export function canonicalDirectory(path: string) {
  try {
    if (!isAbsolute(path)) throw new Error('absolute path required')
    const canonical = realpathSync(path)
    if (!lstatSync(canonical).isDirectory()) throw new Error('not a directory')
    return canonical
  } catch {
    throw new WorkError('DIRECTORY_UNAVAILABLE', '目录不可用，请连接磁盘或重新定位项目目录')
  }
}
export function assertWritable(path: string) {
  const probe = join(path, `.moondot-check-${randomUUID()}`)
  try {
    accessSync(path, constants.W_OK)
    closeSync(openSync(probe, 'wx'))
    unlinkSync(probe)
  } catch {
    throw new WorkError('READ_ONLY', '目录不可写，请检查磁盘连接、剩余空间及写入权限')
  }
}
export function defaultProjectDirectory(documents: string) {
  const directory = join(canonicalDirectory(documents), 'moondot')
  mkdirSync(directory, { recursive: true })
  const canonical = canonicalDirectory(directory)
  assertWritable(canonical)
  return canonical
}
export function stageDirectory(project: Project, key: PhaseKey, requested: string) {
  const root = canonicalDirectory(project.rootDirectory)
  if (resolve(root) !== resolve(project.rootDirectory))
    throw new WorkError('DIRECTORY_UNAVAILABLE', '项目目录指向已改变，请重新定位')
  const phase = phases.find((item) => item.key === key)!
  const base = join(root, phase.folder)
  try {
    if (lstatSync(base).isSymbolicLink() || !lstatSync(base).isDirectory())
      throw new Error('invalid stage')
    const target = resolveInside(base, requested)
    let current = base
    for (const part of relative(base, target).split(sep).filter(Boolean)) {
      current = join(current, part)
      if (lstatSync(current).isSymbolicLink()) throw new Error('symlink')
    }
    if (!lstatSync(target).isDirectory()) throw new Error('not a directory')
    return target
  } catch {
    throw new WorkError('DIRECTORY_UNAVAILABLE', '阶段目录不可用或路径不安全，请检查目录及磁盘连接')
  }
}
export function existingEntry(directory: string, name: string) {
  const target = join(directory, fileName(name))
  try {
    const stat = lstatSync(target)
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
      throw new WorkError('INVALID_OPERATION', '不支持操作符号链接或特殊文件')
  } catch (error) {
    if (error instanceof WorkError) throw error
    throw new WorkError('NOT_FOUND', '文件已移动或删除，请刷新目录')
  }
  return target
}
export const fileKey = (root: string, target: string) => relative(root, target).split(sep).join('/')
