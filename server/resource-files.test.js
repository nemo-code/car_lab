import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('resource attachments are stored, replaced and protected by team/status', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-resource-files-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'test.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'long-admin-password-2026\n', encoding: 'utf8' })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const port = await new Promise(resolve => {
    const listener = net.createServer()
    listener.listen(0, '127.0.0.1', () => { const value = listener.address().port; listener.close(() => resolve(value)) })
  })
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'pipe' })
  const base = `http://127.0.0.1:${port}/api`
  const json = async (endpoint, data, cookie, method = data === undefined ? 'GET' : 'POST') => {
    const response = await fetch(base + endpoint, {
      method,
      headers: { 'X-Forwarded-Proto': 'https', ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
    return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const waitForServer = async () => {
    for (let i = 0; i < 60; i++) {
      try { if ((await json('/health')).response.status === 200) return } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('server did not start')
  }
  try {
    await waitForServer()
    const admin = await json('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
    assert.equal(admin.response.status, 200)
    const applicantA = await json('/apply', { studentId: '25010720732', username: 'file_a', name: 'File A', password: 'student-password-a-2026', team: 'software', statement: '' })
    const applicantB = await json('/apply', { studentId: '25010720733', username: 'file_b', name: 'File B', password: 'student-password-b-2026', team: 'hardware', statement: '' })
    assert.equal(applicantA.response.status, 201)
    assert.equal(applicantB.response.status, 201)
    const applications = (await json('/admin/applications', undefined, admin.cookie)).body.data
    const appA = applications.find(entry => entry.student_id === '25010720732')
    const appB = applications.find(entry => entry.student_id === '25010720733')
    await json(`/admin/applications/${appA.id}/review`, { status: 'approved' }, admin.cookie)
    await json(`/admin/applications/${appB.id}/review`, { status: 'approved' }, admin.cookie)
    const memberA = await json('/login', { account: '25010720732', password: 'student-password-a-2026' })
    const memberB = await json('/login', { account: '25010720733', password: 'student-password-b-2026' })
    const created = await json('/resources', { team: 'software', visibility: 'team', title: 'Protected guide', summary: 'Attachment test', body: 'private body' }, admin.cookie)
    assert.equal(created.response.status, 201)
    const resourceId = created.body.data.id

    const form = new FormData()
    form.append('file', new Blob(['first attachment'], { type: 'text/plain' }), 'guide.txt')
    const uploaded = await fetch(`${base}/resources/${resourceId}/file`, { method: 'POST', headers: { 'X-Forwarded-Proto': 'https', Cookie: admin.cookie }, body: form })
    assert.equal(uploaded.status, 200)
    const adminSummary = (await json('/admin/resources', undefined, admin.cookie)).body.data.find(item => item.id === resourceId)
    assert.equal(adminSummary.filename, 'guide.txt')
    assert.equal(adminSummary.size, Buffer.byteLength('first attachment'))
    const anonymousSummary = (await json('/resources')).body.data.find(item => item.id === resourceId)
    const crossTeamSummary = (await json('/resources', undefined, memberB.cookie)).body.data.find(item => item.id === resourceId)
    for (const summary of [anonymousSummary, crossTeamSummary]) {
      assert.ok(summary)
      for (const key of ['file', 'filename', 'size', 'mime', 'checksum', 'content_id']) assert.equal(Object.hasOwn(summary, key), false)
    }
    assert.equal((await json(`/resources/${resourceId}`, undefined, memberA.cookie)).body.data.filename, 'guide.txt')
    const allowed = await fetch(`${base}/resources/${resourceId}/file`, { headers: { 'X-Forwarded-Proto': 'https', Cookie: memberA.cookie } })
    assert.equal(allowed.status, 200)
    assert.equal(await allowed.text(), 'first attachment')
    assert.equal(allowed.headers.get('content-type'), 'text/plain')
    assert.match(allowed.headers.get('content-disposition') || '', /^attachment;/)
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff')
    const anonymous = await fetch(`${base}/resources/${resourceId}/file`, { headers: { 'X-Forwarded-Proto': 'https' } })
    assert.equal(anonymous.status, 403)
    const crossTeam = await fetch(`${base}/resources/${resourceId}/file`, { headers: { 'X-Forwarded-Proto': 'https', Cookie: memberB.cookie } })
    assert.equal(crossTeam.status, 403)

    const replacement = new FormData()
    replacement.append('file', new Blob(['replacement attachment'], { type: 'text/plain' }), 'replacement.txt')
    const replaced = await fetch(`${base}/resources/${resourceId}/file`, { method: 'POST', headers: { 'X-Forwarded-Proto': 'https', Cookie: admin.cookie }, body: replacement })
    assert.equal(replaced.status, 200)
    const replacedDownload = await fetch(`${base}/resources/${resourceId}/file`, { headers: { 'X-Forwarded-Proto': 'https', Cookie: memberA.cookie } })
    assert.equal(await replacedDownload.text(), 'replacement attachment')

    const mismatchedMime = new FormData()
    mismatchedMime.append('file', new Blob(['not a pdf'], { type: 'text/html' }), 'mismatch.pdf')
    assert.equal((await fetch(`${base}/resources/${resourceId}/file`, { method: 'POST', headers: { 'X-Forwarded-Proto': 'https', Cookie: admin.cookie }, body: mismatchedMime })).status, 400)

    assert.equal((await json(`/resources/${resourceId}/file`, undefined, admin.cookie, 'DELETE')).response.status, 200)
    assert.equal((await fetch(`${base}/resources/${resourceId}/file`, { headers: { 'X-Forwarded-Proto': 'https', Cookie: memberA.cookie } })).status, 404)
    const uploadAgain = new FormData()
    uploadAgain.append('file', new Blob(['offline attachment'], { type: 'text/plain' }), 'offline.txt')
    assert.equal((await fetch(`${base}/resources/${resourceId}/file`, { method: 'POST', headers: { 'X-Forwarded-Proto': 'https', Cookie: admin.cookie }, body: uploadAgain })).status, 200)
    assert.equal((await json(`/resources/${resourceId}`, { }, admin.cookie, 'DELETE')).response.status, 200)
    assert.equal((await fetch(`${base}/resources/${resourceId}/file`, { headers: { 'X-Forwarded-Proto': 'https', Cookie: memberA.cookie } })).status, 403)
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
