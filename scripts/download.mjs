import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'

// Range downloads keep large development tools usable on slow connections.
// Every part is size-checked and the complete archive must match its upstream SHA-256.
const [url, target, sizeArgument, expectedHash] = process.argv.slice(2)
const size = Number(sizeArgument)
if (
  !url?.startsWith('https://') ||
  !target ||
  !Number.isSafeInteger(size) ||
  size <= 0 ||
  !/^[a-f0-9]{64}$/i.test(expectedHash ?? '')
) {
  throw new Error('Usage: node download.mjs <https-url> <target> <bytes> <sha256>')
}
mkdirSync(dirname(target), { recursive: true })
const parts = `${target}.parts`
mkdirSync(parts, { recursive: true })
const chunkSize = 2 * 1024 * 1024
const count = Math.ceil(size / chunkSize)
let next = 0
let completed = 0
const partPath = (index) => `${parts}/${index}.part`

async function worker() {
  while (next < count) {
    const index = next++
    const start = index * chunkSize
    const end = Math.min(size, start + chunkSize) - 1
    const filename = partPath(index)
    let cached = false
    try {
      cached = statSync(filename).size === end - start + 1
    } catch {
      /* New part. */
    }
    if (!cached) {
      await new Promise((resolve, reject) => {
        const child = spawn(
          process.platform === 'win32' ? 'curl.exe' : 'curl',
          [
            '--fail',
            '--location',
            '--silent',
            '--show-error',
            '--retry',
            '3',
            '--max-time',
            '1800',
            '--range',
            `${start}-${end}`,
            '--output',
            filename,
            url,
          ],
          { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
        )
        let error = ''
        child.stderr.on('data', (data) => {
          error += data
        })
        child.on('error', reject)
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`Part ${index}: ${error}`)),
        )
      })
      if (statSync(filename).size !== end - start + 1)
        throw new Error(`Invalid range response: part ${index}`)
    }
    completed++
    if (completed % 8 === 0 || completed === count)
      console.log(`Downloaded ${completed}/${count} parts`)
  }
}
await Promise.all(Array.from({ length: Math.min(8, count) }, worker))
const descriptor = openSync(target, 'w')
try {
  for (let index = 0; index < count; index++) {
    const buffer = readFileSync(partPath(index))
    let offset = 0
    while (offset < buffer.length) offset += writeSync(descriptor, buffer, offset)
  }
} finally {
  closeSync(descriptor)
}
const hash = createHash('sha256')
for await (const chunk of createReadStream(target)) hash.update(chunk)
if (hash.digest('hex') !== expectedHash.toLowerCase()) throw new Error('Archive SHA-256 mismatch')
console.log('Archive SHA-256 verified')
