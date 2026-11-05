import { mkdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

export function applicationPaths(
  appData: string,
  projectRoot: string,
  packaged: boolean,
  override?: string,
) {
  const userData = packaged
    ? join(appData, 'MoonDot')
    : resolve(override ?? join(projectRoot, '.local/userData'))
  return {
    userData,
    database: join(userData, 'data/moondot-remake.db'),
    legacyDatabase: join(userData, 'data/moondot.db'),
    migrationSnapshots: join(userData, 'snapshots/migrations'),
    logs: join(userData, 'logs'),
  }
}

export function ensureApplicationPaths(paths: ReturnType<typeof applicationPaths>) {
  for (const directory of [paths.userData, paths.logs, paths.migrationSnapshots])
    mkdirSync(directory, { recursive: true })
}

export function resolveInside(root: string, requested: string) {
  if (isAbsolute(requested) || requested.includes(':'))
    throw new Error('Absolute paths and alternate data streams are not allowed')
  const canonicalRoot = realpathSync(root)
  const target = resolve(canonicalRoot, requested)
  const contained = (candidate: string) => {
    const suffix = relative(canonicalRoot, candidate)
    return suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix)
  }
  if (!contained(target)) throw new Error('Path escapes root')
  // Resolve an existing ancestor as well, so a symlink cannot redirect a future file outside root.
  let ancestor = target
  for (;;) {
    try {
      if (!contained(realpathSync(ancestor))) throw new Error('Symlink escapes root')
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = resolve(ancestor, '..')
      if (parent === ancestor) throw error
      ancestor = parent
    }
  }
  return target
}
