import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('student-id application, review, login and team resource authorization', async () => {
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
    const applicant = { studentId: '25010720732', username: 'lab_student', name: 'Student', password: 'student-password-2026', team: 'software', statement: 'Interested in software.' }
    assert.equal((await call('/apply', applicant)).status, 201)
    // 学号长度校验：10 位 / 12 位都应被拒绝
    assert.equal((await call('/apply', { ...applicant, studentId: '2501072073' })).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '250107207322' })).status, 400)
    // 重复学号 / 重复用户名都应被拒绝
    assert.equal((await call('/apply', applicant)).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '25010720739' })).status, 400)
    // 学号登录，返回年级
    const pending = await call('/login', { account: applicant.studentId, password: applicant.password })
    assert.equal(pending.body.data.status, 'pending')
    assert.equal(pending.body.data.grade, '25级')
    assert.equal(pending.body.data.username, 'lab_student')
    assert.equal(pending.body.data.studentId, '25010720732')
    // 用户名登录
    const byUsername = await call('/login', { account: applicant.username, password: applicant.password })
    assert.equal(byUsername.body.data.studentId, '25010720732')
    assert.equal(byUsername.body.data.grade, '25级')
    // 错误密码登录失败
    assert.equal((await call('/login', { account: applicant.studentId, password: 'wrong-password' })).status, 401)
    // 管理员邮箱登录依然可用
    const admin = await call('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
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
    assert.equal(applications[0].student_id, '25010720732')
    assert.equal(applications[0].username, 'lab_student')
    assert.equal(applications[0].grade, '25级')
    assert.equal((await call(`/admin/applications/${applications[0].id}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).body.data.body, 'secret source code')
    assert.equal((await call(`/admin/applications/${applications[0].id}/review`, { status: 'rejected' }, admin.cookie)).status, 400)
    assert.equal((await call('/apply', { studentId: '25010720733', name: 'Other', password: applicant.password, team: 'hardware', statement: 'Hardware fan.' })).status, 201)
    const other = await call('/login', { account: '25010720733', password: applicant.password })
    assert.equal(other.body.data.grade, '25级')
    const otherId = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(a => a.student_id === '25010720733').id
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

test('legacy email-only database migrates to the student-id schema', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-migrate-'))
  const dbFile = path.join(dir, 'legacy.sqlite')
  try {
    const { DatabaseSync } = await import('node:sqlite')
    const { scryptSync, randomBytes, randomUUID } = await import('node:crypto')
    const salt = randomBytes(16).toString('hex')
    const passwordHash = `${salt}:${scryptSync('legacy-password-2026', salt, 64).toString('hex')}`
    const legacy = new DatabaseSync(dbFile)
    legacy.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member')")
    legacy.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), 'oldadmin@example.org', 'Old Admin', passwordHash, 'software', 'approved', 'admin')
    legacy.close()
    process.env.LAB_DB_PATH = dbFile
    const platform = await import('./platform.js')
    // 旧管理员仍可用邮箱登录
    const admin = platform.login('oldadmin@example.org', 'legacy-password-2026')
    assert.ok(admin, 'legacy admin login failed')
    assert.equal(admin.user.role, 'admin')
    assert.equal(admin.user.studentId, null)
    // 迁移后可按新流程注册
    platform.apply({ studentId: '24010720001', name: 'Newbie', password: 'newbie-password-2026', team: 'hardware', statement: 'hello' })
    const listed = platform.applications()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].student_id, '24010720001')
    assert.equal(listed[0].grade, '24级')
    const freshman = platform.login('24010720001', 'newbie-password-2026')
    assert.equal(freshman.user.grade, '24级')
  } finally {
    delete process.env.LAB_DB_PATH
    rmSync(dir, { recursive: true, force: true })
  }
})
