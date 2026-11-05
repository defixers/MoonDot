import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { URL } from 'node:url'

const require = createRequire(import.meta.url)
const root = new URL('../', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
let failed = false
function report(name, ok, detail) {
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${detail}`)
  if (!ok) failed = true
}
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
report('Node.js', nodeMajor === 24 && nodeMinor >= 21, process.version)
report(
  'pnpm',
  (process.env.npm_config_user_agent ?? '').startsWith('pnpm/12.10.1 '),
  manifest.packageManager,
)
try {
  const electronRoot = dirname(require.resolve('electron/package.json'))
  const relativePath = readFileSync(join(electronRoot, 'path.txt'), 'utf8')
  const executable = join(electronRoot, 'dist', relativePath)
  report('Electron', existsSync(executable), executable)
} catch (error) {
  report('Electron', false, error.message)
}
for (const binary of ['ffmpeg', 'ffprobe']) {
  const extension = process.platform === 'win32' ? '.exe' : ''
  const folder = join('resources', 'ffmpeg', `${process.platform}-${process.arch}`, 'bin')
  const executable = join(folder, `${binary}${extension}`)
  const version = spawnSync(executable, ['-version'], { encoding: 'utf8', windowsHide: true })
  const license = spawnSync(executable, ['-L'], { encoding: 'utf8', windowsHide: true })
  const output = `${version.stdout ?? ''}\n${version.stderr ?? ''}`
  const licenseText = `${license.stdout ?? ''}\n${license.stderr ?? ''}`
  const lgpl =
    licenseText.includes('GNU Lesser General Public') && !/--enable-(gpl|nonfree)/.test(output)
  report(
    binary,
    version.status === 0 && license.status === 0 && lgpl,
    version.error?.message ?? `${output.split('\n')[0]} (LGPL: ${lgpl})`,
  )
}
console.log('SQLite ABI, WAL, transactions and IPC: run pnpm build && pnpm test.')
process.exitCode = failed ? 1 : 0
