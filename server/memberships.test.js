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
    listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)) })
  })
}

test('memberships allow independent team approval and resource authorization', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-memberships-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'memberships.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
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
    for (let i = 0; i < 60; i++) { try { if ((await call('/health')).status === 200) break } catch {}; await new Promise(resolve => setTimeout(resolve, 50)) }
    const stamp = String(Date.now()).slice(-9)
    const first = await call('/apply', { studentId: `25${stamp}`, username: `multi${stamp}`, name: 'Multi Member', password: 'student-password-2026', team: 'software', statement: 'software' })
    assert.equal(first.status, 201)
    const admin = await call('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
    const firstReview = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(item => item.id === first.body.data.id)
    assert.equal((await call(`/admin/applications/${firstReview.id}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    const memberLogin = await call('/login', { account: `25${stamp}`, password: 'student-password-2026' })
    assert.equal(memberLogin.status, 200)
    const applySecond = await call('/apply-team', { team: 'hardware', statement: 'hardware too' }, memberLogin.cookie)
    assert.equal(applySecond.status, 201)
    const secondReview = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(item => item.id === applySecond.body.data.id)
    assert.equal(secondReview.team, 'hardware')
    assert.equal((await call(`/admin/applications/${secondReview.id}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    const me = await call('/me', undefined, memberLogin.cookie)
    assert.equal(me.body.data.memberships.length, 2)
    assert.deepEqual(me.body.data.memberships.map(item => item.team).sort(), ['hardware', 'software'])
    const resource = await call('/resources', { team: 'hardware', title: 'Hardware private', summary: 'Private', visibility: 'team', body: 'secret' }, admin.cookie)
    assert.equal(resource.status, 201)
    assert.equal((await call(`/resources/${resource.body.data.id}`, undefined, memberLogin.cookie)).status, 200)
    const revoked = await call(`/admin/memberships/${me.body.data.memberships.find(item => item.team === 'hardware').id}/revoke`, {}, admin.cookie)
    assert.equal(revoked.status, 200)
    assert.equal((await call(`/resources/${resource.body.data.id}`, undefined, memberLogin.cookie)).status, 403)
    const membershipList = (await call('/admin/memberships', undefined, admin.cookie)).body.data
    assert.ok(membershipList.some(item => item.team === 'hardware' && item.status === 'revoked'))
  } finally {
    if (server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)) }
    rmSync(dir, { recursive: true, force: true })
  }
})
