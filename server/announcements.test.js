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

test('announcements support public publication, admin lifecycle and offline isolation', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-announcements-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'announcements.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'long-admin-password-2026\n', encoding: 'utf8' })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const port = await freePort()
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'pipe' })
  const base = `http://127.0.0.1:${port}/api`
  const call = async (endpoint, data, cookie, method) => {
    const response = await fetch(base + endpoint, {
      method: method || (data === undefined ? 'GET' : 'POST'),
      headers: { 'X-Forwarded-Proto': 'https', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await call('/health')).status === 200) break } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const admin = await call('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
    assert.equal(admin.status, 200)
    const anonymousBefore = await call('/announcements')
    assert.deepEqual(anonymousBefore.body.data, [])
    const draft = await call('/admin/announcements', {
      slug: 'lab-open-day', title: '实验室开放日', summary: '欢迎来实验室参观。', body: '开放日安排：周五下午。', kind: 'notice', status: 'draft', pinned: true, sort_order: 1,
    }, admin.cookie)
    assert.equal(draft.status, 201)
    assert.equal((await call('/announcements/lab-open-day')).status, 404)
    const ordinary = await call('/admin/announcements', undefined)
    assert.equal(ordinary.status, 403)
    const published = await call(`/admin/announcements/${draft.body.data.id}`, { status: 'published' }, admin.cookie, 'PATCH')
    assert.equal(published.status, 200)
    assert.equal((await call('/announcements')).body.data[0].slug, 'lab-open-day')
    assert.equal((await call('/announcements/lab-open-day')).body.data.body, '开放日安排：周五下午。')
    const offline = await call(`/admin/announcements/${draft.body.data.id}/offline`, {}, admin.cookie)
    assert.equal(offline.status, 200)
    assert.equal((await call('/announcements')).body.data.length, 0)
    assert.equal((await call('/admin/announcements', undefined, admin.cookie)).body.data[0].status, 'offline')
    const audit = (await call('/admin/audit', undefined, admin.cookie)).body.data
    assert.ok(audit.some(entry => entry.action === 'announcement.create'))
    assert.ok(audit.some(entry => entry.action === 'announcement.publish'))
    assert.ok(audit.some(entry => entry.action === 'announcement.offline'))
    assert.ok(!audit.some(entry => JSON.stringify(entry.metadata).includes('开放日安排')))
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
