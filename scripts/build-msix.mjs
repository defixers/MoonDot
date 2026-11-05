import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

const projectDir = fileURLToPath(new URL('../', import.meta.url))

try {
  const required = [
    'MOONDOT_STORE_IDENTITY_NAME',
    'MOONDOT_STORE_PUBLISHER',
    'MOONDOT_STORE_PUBLISHER_DISPLAY_NAME',
  ]
  const values = required.map((key) => {
    const value = process.env[key]
    if (!value || value !== value.trim() || /[\r\n\0]/.test(value)) {
      throw new Error(`Set ${key} exactly as shown in Partner Center. See docs/microsoft-store.md.`)
    }
    return value
  })
  const [identityName, publisher, publisherDisplayName] = values
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) throw new Error('Invalid Store Identity Name.')
  if (!/^CN=\S/.test(publisher))
    throw new Error('Store Publisher must be the full CN= value from Partner Center.')
  const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const versionParts = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
    .exec(metadata.version)
    ?.slice(1, 4)
  if (!versionParts || versionParts.some((part) => Number(part) > 65535)) {
    throw new Error('package.json version must have three numeric components between 0 and 65535.')
  }
  // The Store reserves the fourth component; CI build numbers must not populate it.
  const version = `${versionParts.map(Number).join('.')}.0`
  const config = {
    extends: './electron-builder.yml',
    directories: { output: 'release/msix' },
    publish: null,
    win: { target: [{ target: 'appx', arch: ['x64'] }] },
    appx: {
      identityName,
      publisher,
      publisherDisplayName,
      applicationId: 'MoonDot',
      artifactName: `MoonDot-${version}-x64.msix`,
      minVersion: '10.0.19045.0',
      maxVersionTested: '10.0.19045.0',
      languages: ['zh-CN'],
      capabilities: ['runFullTrust'],
      setBuildNumber: false,
      electronUpdaterAware: false,
      addAutoLaunchExtension: false,
    },
  }
  if (process.argv.slice(2).some((arg) => arg !== '--check'))
    throw new Error('Only --check is supported.')
  if (process.argv.includes('--check')) {
    console.log(JSON.stringify({ version, config }, null, 2))
    console.log(
      'Configuration validated locally; Partner Center ownership, assets and certification still require review.',
    )
  } else {
    if (process.platform !== 'win32') throw new Error('Build Store MSIX packages on Windows x64.')
    // A Store submission does not need a local signing certificate. Do not auto-discover one.
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    for (const key of ['CSC_LINK', 'WIN_CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD'])
      delete process.env[key]
    const { build, Platform, Arch } = await import('electron-builder')
    await build({
      projectDir,
      targets: Platform.WINDOWS.createTarget('appx', Arch.x64),
      config,
      publish: 'never',
    })
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MSIX build failed.')
  process.exitCode = 1
}
