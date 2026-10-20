import { execFileSync, spawn } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const hooksDir = path.join(repoRoot, 'pocketbase', 'pb_hooks')
const sourceMigrationsDir = path.join(repoRoot, 'pocketbase', 'pb_migrations')
const publicDir = path.join(repoRoot, 'public')

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

function findBinary() {
  const candidates = [
    process.env.POCKETBASE_BINARY,
    path.join(repoRoot, '.runtime', 'bin', 'pocketbase'),
    path.join(repoRoot, 'pocketbase', 'pocketbase'),
  ].filter(Boolean)
  return candidates.find(filename => {
    try {
      execFileSync(filename, ['--version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }) || ''
}

async function waitForHealth(url, child, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`${label} exited before health check`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The process may need a few attempts while starting.
    }
    await sleep(100)
  }
  throw new Error(`${label} health check timed out`)
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    sleep(3000).then(() => { if (child.exitCode === null) child.kill('SIGKILL') }),
  ])
}

async function authenticate(base, email, password) {
  const response = await fetch(`${base}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.token) throw new Error('PocketBase superuser authentication failed')
  return payload.token
}

export async function runPocketBaseBrowserSmoke() {
  const binary = findBinary()
  if (!binary) throw new Error('PocketBase binary not found; set POCKETBASE_BINARY')
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'car-lab-pb-browser-'))
  const migrationsDir = path.join(dataDir, 'pb_migrations')
  await cp(sourceMigrationsDir, migrationsDir, { recursive: true })
  const pocketbasePort = await freePort()
  const vitePort = await freePort()
  const email = `browser-super-${Date.now()}@example.invalid`
  const password = `BrowserSuper-${randomBytes(18).toString('base64url')}`
  const pocketbaseBase = `http://127.0.0.1:${pocketbasePort}`
  const browserBase = `http://127.0.0.1:${vitePort}`
  let pocketbase
  let vite
  try {
    execFileSync(binary, [
      'superuser', 'create', email, password,
      '--dir', dataDir, '--hooksDir', hooksDir, '--migrationsDir', migrationsDir,
      '--automigrate=true',
    ], { stdio: 'ignore', timeout: 30000 })
    pocketbase = spawn(binary, [
      'serve', '--http', `127.0.0.1:${pocketbasePort}`, '--dir', dataDir,
      '--hooksDir', hooksDir, '--migrationsDir', migrationsDir, '--publicDir', publicDir,
      '--automigrate=true', '--hooksWatch=false',
    ], { stdio: 'ignore' })
    await waitForHealth(`${pocketbaseBase}/api/health`, pocketbase, 'PocketBase')
    const token = await authenticate(pocketbaseBase, email, password)
    const env = { ...process.env, POCKETBASE_URL: pocketbaseBase, POCKETBASE_ADMIN_TOKEN: token }
    execFileSync(process.execPath, ['scripts/seed-pocketbase-site.mjs', '--apply'], { cwd: repoRoot, env, stdio: 'ignore', timeout: 30000 })
    execFileSync(process.execPath, ['scripts/seed-pocketbase-projects.mjs', '--apply'], { cwd: repoRoot, env, stdio: 'ignore', timeout: 30000 })
    const { verifyFlow } = await import('./verify-pocketbase-flow.mjs')
    const apiFlow = await verifyFlow({ base: pocketbaseBase, superToken: token, checkNaturalFileTokenExpiry: true })

    vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(vitePort)], {
      cwd: repoRoot,
      env: { ...process.env, VITE_PLATFORM_BACKEND: 'pocketbase', VITE_POCKETBASE_URL: '/api', VITE_DEV_API_TARGET: pocketbaseBase },
      stdio: 'ignore',
    })
    await waitForHealth(`${browserBase}/`, vite, 'Vite')
    const output = execFileSync(process.execPath, ['scripts/browser-smoke.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, BROWSER_BASE_URL: browserBase },
      encoding: 'utf8',
      timeout: 120000,
    })
    const result = JSON.parse(output.trim())
    return {
      backend: 'pocketbase',
      pass: result.pass === true && apiFlow.pass === true,
      viewports: result.results.length,
      apiFlow: {
        approvals: apiFlow.review.approved,
        protectedFile: apiFlow.file.protectedDownload,
        passwordChangeSession: apiFlow.permissions.passwordChangeSession,
        passwordResetSession: apiFlow.permissions.passwordResetSession,
        roleWriteRejected: apiFlow.permissions.memberRoleWrite,
        naturalFileTokenExpiry: apiFlow.file.naturalExpiry,
      },
    }
  } finally {
    await stop(vite)
    await stop(pocketbase)
    await rm(dataDir, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(await runPocketBaseBrowserSmoke())}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
