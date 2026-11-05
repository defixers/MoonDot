import type { IpcMainInvokeEvent } from 'electron'
import { expect, it, vi } from 'vitest'
import { profileSchema } from '../../src/shared/settings'
import { isTrustedDocument, validatedHandler } from '../../src/main/ipc/router'
const event = {} as IpcMainInvokeEvent
it('accepts only the configured document, including hash-based internal navigation', () => {
  expect(isTrustedDocument('file:///app/index.html#/settings', 'file:///app/index.html')).toBe(true)
  for (const url of [
    'https://evil.test',
    'file:///other/index.html',
    'file://host/app/index.html',
    'file:///app/index.html?other',
  ])
    expect(isTrustedDocument(url, 'file:///app/index.html')).toBe(false)
  expect(isTrustedDocument('http://127.0.0.1:5174/', 'http://127.0.0.1:5173/')).toBe(false)
})
it('checks the sender before validation and never runs invalid input', async () => {
  const action = vi.fn()
  const report = vi.fn()
  const denied = validatedHandler(profileSchema, action, () => false, report)
  expect(await denied(event, { displayName: 'a' })).toMatchObject({
    ok: false,
    error: { code: 'FORBIDDEN' },
  })
  const allowed = validatedHandler(profileSchema, action, () => true, report)
  for (const input of [{ displayName: 'x'.repeat(81) }, { displayName: 'a', path: '/tmp' }, null]) {
    expect(await allowed(event, input)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    })
  }
  expect(action).not.toHaveBeenCalled()
})
it('sanitizes internal errors and handles disk exhaustion explicitly', async () => {
  const report = vi.fn()
  const handler = validatedHandler(
    profileSchema,
    () => {
      throw Object.assign(new Error('private database path'), { code: 'SQLITE_FULL' })
    },
    () => true,
    report,
  )
  const result = await handler(event, { displayName: 'a' })
  expect(result).toMatchObject({ ok: false, error: { code: 'DISK_FULL' } })
  expect(JSON.stringify(result)).not.toContain('private')
  expect(report).toHaveBeenCalledOnce()
})
