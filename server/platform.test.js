import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('application, review, login and team resource authorization', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-platform-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'test.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'long-admin-password-2026\n', encoding: 'utf8' })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const port = await new Promise(resolve => {
    const listener = net.createServer()
    listener.listen(0, '127.0.0.1', () => { const value = listener.address().port; listener.close(() => resolve(value)) })
  })
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'pipe' })
  const base = `http://127.0.0.1:${port}/api`
  const call = async (endpoint, data, cookie) => {
    const response = await fetch(base + endpoint, { method: data === undefined ? 'GET' : 'POST', headers: { 'X-Forwarded-Proto': 'https', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { if ((await call('/health')).status === 200) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not start')
    assert.equal((await fetch(base + '/resources')).status, 403)
    const applicant = { email: 'student@example.org', name: 'Student', password: 'student-password-2026', team: 'software', statement: 'Interested in software.' }
    assert.equal((await call('/apply', applicant)).status, 201)
    assert.equal((await call('/apply', applicant)).status, 400)
    const pending = await call('/login', { email: applicant.email, password: applicant.password })
    assert.equal(pending.body.data.status, 'pending')
    const admin = await call('/login', { email: 'admin@example.org', password: 'long-admin-password-2026' })
    assert.equal(admin.body.data.role, 'admin')
    const created = await call('/resources', { team: 'software', visibility: 'team', title: 'Private source', summary: 'Restricted', body: 'secret source code' }, admin.cookie)
    assert.equal(created.status, 201)
    const id = created.body.data.id
    const listing = await call('/resources')
    assert.equal(listing.body.data.length, 1)
    assert.ok(!JSON.stringify(listing.body).includes('secret source code'))
    assert.equal((await call(`/resources/${id}`)).status, 403)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).status, 403)
    assert.equal((await call('/admin/applications', undefined, pending.cookie)).status, 403)
    const applications = (await call('/admin/applications', undefined, admin.cookie)).body.data
    assert.equal(applications.length, 1)
    assert.equal((await call(`/admin/applications/${applications[0].id}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).body.data.body, 'secret source code')
    assert.equal((await call(`/admin/applications/${applications[0].id}/review`, { status: 'rejected' }, admin.cookie)).status, 400)
    assert.equal((await call('/apply', { ...applicant, email: 'other@example.org', team: 'hardware' })).status, 201)
    const other = await call('/login', { email: 'other@example.org', password: applicant.password })
    const otherId = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(a => a.email === 'other@example.org').id
    assert.equal((await call(`/admin/applications/${otherId}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    assert.equal((await call(`/resources/${id}`, undefined, other.cookie)).status, 403)
    const publicResource = await call('/resources', { team: 'hardware', visibility: 'public', title: 'Guide', summary: 'Intro', body: 'Open content' }, admin.cookie)
    assert.equal((await call(`/resources/${publicResource.body.data.id}`)).body.data.body, 'Open content')
    assert.equal((await call('/logout', {}, pending.cookie)).status, 200)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).status, 403)
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
