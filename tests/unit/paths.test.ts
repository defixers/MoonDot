import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { applicationPaths, resolveInside } from '../../src/main/infra/paths'
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
it('isolates production data from development overrides', () => {
  const root = mkdtempSync(join(tmpdir(), 'moondot-paths-'))
  roots.push(root)
  expect(
    applicationPaths(join(root, 'appData'), join(root, 'project'), true, join(root, 'override'))
      .userData,
  ).toBe(join(root, 'appData/MoonDot'))
  expect(applicationPaths(root, join(root, 'project'), false).userData).toBe(
    join(root, 'project/.local/userData'),
  )
})
it('rejects traversal, sibling-prefix tricks, absolute paths, streams and symlink escapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'moondot-containment-'))
  roots.push(root)
  const library = join(root, 'library')
  const outside = join(root, 'library-other')
  mkdirSync(library)
  mkdirSync(outside)
  expect(resolveInside(library, '中文/new.wav')).toBe(join(library, '中文/new.wav'))
  for (const path of ['../library-other/a', '../../a', outside, 'file.wav:payload'])
    expect(() => resolveInside(library, path)).toThrow()
  symlinkSync(outside, join(library, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(() => resolveInside(library, 'linked/new.wav')).toThrow('Symlink escapes')
})
