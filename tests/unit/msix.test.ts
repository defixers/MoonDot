import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const exampleIdentity = {
  MOONDOT_STORE_IDENTITY_NAME: 'Example.MoonDot',
  MOONDOT_STORE_PUBLISHER: 'CN=00000000-0000-0000-0000-000000000000',
  MOONDOT_STORE_PUBLISHER_DISPLAY_NAME: 'Test Publisher',
}
function check(overrides: Partial<typeof exampleIdentity> = {}) {
  return spawnSync(process.execPath, [resolve('scripts/build-msix.mjs'), '--check'], {
    encoding: 'utf8',
    env: { ...process.env, ...exampleIdentity, ...overrides },
  })
}

it('validates MSIX configuration without building or publishing a package', () => {
  const result = check()
  expect(result.status, result.stderr).toBe(0)
  const output = result.stdout.slice(0, result.stdout.lastIndexOf('}') + 1)
  const { version, config } = JSON.parse(output)
  expect(version).toMatch(/^\d+\.\d+\.\d+\.0$/)
  expect(config.publish).toBeNull()
  expect(config.appx).toMatchObject({
    identityName: exampleIdentity.MOONDOT_STORE_IDENTITY_NAME,
    publisher: exampleIdentity.MOONDOT_STORE_PUBLISHER,
    capabilities: ['runFullTrust'],
    electronUpdaterAware: false,
    setBuildNumber: false,
  })
  expect(config.appx.artifactName).toBe(`MoonDot-${version}-x64.msix`)
})

it.each([
  { MOONDOT_STORE_IDENTITY_NAME: '' },
  { MOONDOT_STORE_IDENTITY_NAME: '../MoonDot' },
  { MOONDOT_STORE_PUBLISHER: 'Test Publisher' },
  { MOONDOT_STORE_PUBLISHER_DISPLAY_NAME: ' Test Publisher ' },
])('refuses missing or malformed Store identity: %j', (overrides) => {
  const result = check(overrides)
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/Partner Center|Invalid Store/)
  expect(result.stdout).toBe('')
})
