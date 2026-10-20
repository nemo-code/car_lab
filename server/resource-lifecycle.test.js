import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('resources move through draft, published and offline while public reads stay published-only', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-resource-lifecycle-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'test.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'long-admin-password-2026\n', encoding: 'utf8' })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const port = await new Promise(resolve => {
    const listener = net.createServer()
    listener.listen(0, '127.0.0.1', () => { const value = listener.address().port; listener.close(() => resolve(value)) })
  })
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'pipe' })
  const base = `http://127.0.0.1:${port}/api`
  const call = async (endpoint, data, cookie, method = data === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + endpoint, {
      method,
      headers: { 'X-Forwarded-Proto': 'https', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
    return { status: response.status, body: await response.json().catch(() => ({})), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try { if ((await call('/health')).status === 200) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not start')
    const admin = await call('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
    assert.equal(admin.status, 200)
    const resource = async (title, status) => call('/resources', {
      team: 'software', visibility: 'public', title, summary: 'Lifecycle fixture', body: `${title} body`, status,
    }, admin.cookie)

    const published = await resource('Published lifecycle fixture', 'published')
    const draft = await resource('Draft lifecycle fixture', 'draft')
    const offline = await resource('Offline lifecycle fixture', 'offline')
    assert.equal(published.status, 201)
    assert.equal(draft.status, 201)
    assert.equal(offline.status, 201)
    const publishedId = published.body.data.id
    const draftId = draft.body.data.id
    const offlineId = offline.body.data.id

    const anonymousList = await call('/resources')
    assert.deepEqual(anonymousList.body.data.map(item => item.id).filter(id => !id.startsWith('git-')), [publishedId])
    assert.equal((await call(`/resources/${draftId}`)).status, 403)
    assert.equal((await call(`/resources/${offlineId}`)).status, 403)
    const adminList = await call('/admin/resources', undefined, admin.cookie)
    assert.deepEqual(new Set(adminList.body.data.map(item => item.status)), new Set(['draft', 'published', 'offline']))
    assert.equal((await call(`/resources/${draftId}`, undefined, admin.cookie)).body.data.body, 'Draft lifecycle fixture body')

    assert.equal((await call(`/resources/${draftId}/status`, { status: 'published' }, admin.cookie, 'PATCH')).body.data.status, 'published')
    assert.ok((await call('/resources')).body.data.some(item => item.id === draftId))
    assert.equal((await call(`/resources/${publishedId}/status`, { status: 'offline' }, admin.cookie, 'PATCH')).body.data.status, 'offline')
    assert.ok(!(await call('/resources')).body.data.some(item => item.id === publishedId))
    assert.equal((await call(`/resources/${publishedId}/status`, { status: 'draft' }, admin.cookie, 'PATCH')).body.data.status, 'draft')
    assert.ok(!(await call('/resources')).body.data.some(item => item.id === publishedId))
    assert.equal((await call(`/resources/${publishedId}/status`, { status: 'published' }, admin.cookie, 'PATCH')).body.data.status, 'published')
    assert.ok((await call('/resources')).body.data.some(item => item.id === publishedId))

    assert.equal((await call(`/resources/${offlineId}/status`, { status: 'published' }, admin.cookie, 'PATCH')).body.data.status, 'published')
    assert.equal((await call(`/resources/${draftId}/status`, { status: 'unknown' }, admin.cookie, 'PATCH')).status, 400)
    assert.equal((await call(`/resources/${draftId}/status`, { status: 'offline' }, undefined, 'PATCH')).status, 403)
    assert.equal((await call(`/resources/${draftId}/status`, { status: 'published', extra: true }, admin.cookie, 'PATCH')).status, 400)

    const audit = (await call('/admin/audit', undefined, admin.cookie)).body.data
    assert.ok(audit.some(entry => entry.action === 'resource.create'))
    assert.ok(audit.some(entry => entry.action === 'resource.publish'))
    assert.ok(audit.some(entry => entry.action === 'resource.draft'))
    assert.ok(audit.some(entry => entry.action === 'resource.offline'))
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
