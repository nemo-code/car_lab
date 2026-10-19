import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.E2E_BACKEND = 'pocketbase'
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
if (!process.env.POCKETBASE_BINARY) {
  const candidates = [
    path.join(repoRoot, '.runtime', 'bin', 'pocketbase'),
    path.join(repoRoot, 'pocketbase', 'pocketbase'),
  ]
  process.env.POCKETBASE_BINARY = candidates.find(binary => {
    try { return execFileSync(binary, ['--version'], { encoding: 'utf8' }).includes('0.40.5') } catch { return false }
  }) || ''
}

const { runFlow } = await import('./browser-e2e.mjs')

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(await runFlow())}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
