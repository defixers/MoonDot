import { expect, it } from 'vitest'
import {
  coverSchema,
  emptyStages,
  MAX_COVER_BYTES,
  parsePersonnel,
  personnelSchema,
  stageSchema,
  workSchemas,
} from '../../src/shared/work'

it('accepts exactly 10 MiB covers and rejects oversized or malformed base64', () => {
  const data = (size: number) => 'data:image/png;base64,' + Buffer.alloc(size).toString('base64')
  expect(coverSchema.safeParse(data(MAX_COVER_BYTES)).success).toBe(true)
  expect(coverSchema.safeParse(data(MAX_COVER_BYTES + 1)).success).toBe(false)
  for (const value of [
    'data:image/svg+xml;base64,AAAA',
    'data:image/png;base64,A===',
    'data:image/png;base64,AA=A',
    'data:image/png;base64,AAA',
    'javascript:alert(1)',
  ])
    expect(coverSchema.safeParse(value).success).toBe(false)
})
it('normalizes and deduplicates personnel while preserving separators in the raw editor text', () => {
  expect(parsePersonnel(' 林深，阿海\n林深、明月; Léo；Le\u0301o ')).toEqual({
    names: ['林深', '阿海', '明月', 'Léo'],
    error: '',
  })
  expect(parsePersonnel(' \n，；').names).toEqual([])
  expect(parsePersonnel('人'.repeat(121)).error).toContain('120')
  expect(parsePersonnel(Array.from({ length: 101 }, (_, i) => '人' + i).join(',')).error).toContain(
    '100',
  )
})
it('rejects hidden controls, invalid role keys and oversized personnel at the IPC boundary', () => {
  for (const name of ['林\u0000深', '林\u202e深', '\u200b', '人'.repeat(121)])
    expect(personnelSchema.safeParse([name]).success).toBe(false)
  expect(personnelSchema.safeParse(Array(101).fill('a')).success).toBe(false)
  for (const role of ['__proto__', 'constructor', 'prototype', '作曲']) {
    const people = JSON.parse(JSON.stringify({ [role]: ['x'] }))
    expect(stageSchema.safeParse({ ...emptyStages()[0], people }).success).toBe(false)
  }
  expect(personnelSchema.parse(['<img src=x onerror=alert(1)>'])).toEqual([
    '<img src=x onerror=alert(1)>',
  ])
})
it('has no user-selectable conflict policy in the import contract', () => {
  expect(
    workSchemas.startImport.safeParse({
      projectId: 'a3fe64aa-2c33-48b7-a892-3158800e3bc2',
      stage: 'planning',
      directory: '',
      sources: ['a.wav'],
      conflict: 'skip',
    }).success,
  ).toBe(false)
})
