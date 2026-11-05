import { expect, it } from 'vitest'
import { rankBetween } from '../../src/main/services/rank'
it('keeps lexical order through repeated inserts at the start, end and between adjacent keys', () => {
  const keys: string[] = []
  for (let i = 0; i < 250; i++) {
    const index = (i * 17) % (keys.length + 1)
    const key = rankBetween(keys[index - 1] ?? null, keys[index] ?? null)
    keys.splice(index, 0, key)
    expect([...keys].sort()).toEqual(keys)
    expect(new Set(keys).size).toBe(keys.length)
  }
  const before = rankBetween(null, keys[0]!),
    after = rankBetween(keys.at(-1)!, null)
  expect(before < keys[0]!).toBe(true)
  expect(after > keys.at(-1)!).toBe(true)
  expect(() => rankBetween('z', 'a')).toThrow()
})
