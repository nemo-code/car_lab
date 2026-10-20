import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

async function freePort() {
  return new Promise(resolve => {
    const listener = net.createServer()
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port
      listener.close(() => resolve(port))
    })
  })
}

test('public application and login attempts use the documented per-minute limits', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-rate-limit-'))
  const port = await freePort()
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'rate-limit.sqlite'), HOST: '127.0.0.1', PORT: String(port), LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], {
    env,
    input: 'long-admin-password-2026\n',
    encoding: 'utf8',
  })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const server = spawn(process.execPath, ['server/index.js'], { env, stdio: 'pipe' })
  const base = `http://127.0.0.1:${port}/api`
  const call = async (endpoint, body) => {
    const response = await fetch(base + endpoint, {
      method: 'POST',
      headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return response.status
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        if ((await fetch(`${base}/health`, { headers: { 'X-Forwarded-Proto': 'https' } })).ok) {
          ready = true
          break
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not start')
    const stamp = Number(String(Date.now()).slice(-9))
    const applicationStatuses = []
    for (let index = 0; index < 6; index += 1) {
      const suffix = String(stamp + index).slice(-9).padStart(9, '0')
      applicationStatuses.push(await call('/apply', {
        studentId: `25${suffix}`,
        username: `rate${suffix}`,
        name: `Rate ${index}`,
        password: 'student-password-2026',
        team: 'software',
        statement: '',
      }))
    }
    assert.deepEqual(applicationStatuses.slice(0, 5), [201, 201, 201, 201, 201])
    assert.equal(applicationStatuses[5], 429)

    const loginStatuses = []
    for (let index = 0; index < 11; index += 1) loginStatuses.push(await call('/login', { account: `not-found-${index}`, password: 'wrong-password-2026' }))
    assert.deepEqual(loginStatuses.slice(0, 10), Array.from({ length: 10 }, () => 401))
    assert.equal(loginStatuses[10], 429)
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
