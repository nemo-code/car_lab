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
    const call = async (endpoint, data, cookie, method, ip = '127.0.0.1') => {
      const response = await fetch(base + endpoint, { method: method || (data === undefined ? 'GET' : 'POST'), headers: { 'X-Forwarded-Proto': 'https', 'X-Real-IP': ip, 'X-Forwarded-For': ip, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { if ((await call('/health')).status === 200) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not start')
    const securedHealth = await fetch(base + '/health', { headers: { 'X-Forwarded-Proto': 'https' } })
    assert.equal(securedHealth.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(securedHealth.headers.get('referrer-policy'), 'strict-origin-when-cross-origin')
    assert.equal(securedHealth.headers.get('x-frame-options'), 'SAMEORIGIN')
    assert.match(securedHealth.headers.get('content-security-policy') || '', /default-src 'self'/)
    assert.equal(securedHealth.headers.get('strict-transport-security'), 'max-age=15552000')
    assert.equal((await fetch(base + '/resources')).status, 403)
    const applicant = { studentId: '25010720732', username: 'lab_student', name: 'Student', password: 'student-password-2026', team: 'software', statement: '' }
    assert.equal((await call('/apply', applicant)).status, 201)
    // 学号长度校验：10 位 / 12 位都应被拒绝
    assert.equal((await call('/apply', { ...applicant, studentId: '2501072073' }, undefined, undefined, '10.0.0.2')).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '250107207322' }, undefined, undefined, '10.0.0.3')).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '2501072073x' }, undefined, undefined, '10.0.0.4')).status, 400)
    // 重复学号 / 重复用户名都应被拒绝
    assert.equal((await call('/apply', applicant)).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '25010720739' }, undefined, undefined, '10.0.0.5')).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '25010720739', username: 'Lab_Student' }, undefined, undefined, '10.0.0.6')).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '25010720739', username: '123student' }, undefined, undefined, '10.0.0.7')).status, 400)
    assert.equal((await call('/apply', { ...applicant, studentId: '25010720739', username: '小车实验室' }, undefined, undefined, '10.0.0.8')).status, 400)
    assert.equal((await call('/login', { account: '2501072073', password: applicant.password })).body.message, '学号应为 11 位数字')
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
    assert.equal((await call('/login', { account: 'LAB_STUDENT', password: applicant.password })).status, 200)
    // 错误密码登录失败
    assert.equal((await call('/login', { account: applicant.studentId, password: 'wrong-password' })).status, 401)
    // 管理员邮箱登录依然可用
    const admin = await call('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
    assert.equal(admin.body.data.role, 'admin')
    const seededProjects = await call('/projects')
    assert.equal(seededProjects.status, 200)
    assert.equal(seededProjects.body.data.length, 9)
    assert.equal(seededProjects.body.data[0].edition, 'xiaoxueqi-2026')
    assert.equal((await call('/admin/projects', undefined, pending.cookie)).status, 403)
    const createdProject = await call('/admin/projects', {
      legacy_id: '', edition: 'custom', slug: 'runtime-project-2026', group: '软件实践组', category: 'software', categoryLabel: '软件系统',
      title: '运行时项目', subtitle: '后台创建的项目', summary: '用于验证项目成果后台管理链路。', tags: ['Vue'], highlights: ['可编辑'], outcomes: ['可下线'], tech: ['Node'],
      members: '测试成员', media: ['assets/runtime.png'], videos: [{ label: '演示', path: '../missing/demo.mp4' }], files: [], accent: 'lime', sort_order: 99, status: 'published',
    }, admin.cookie)
    assert.equal(createdProject.status, 201)
    const projectId = createdProject.body.data.id
    assert.equal((await call(`/projects/${projectId}`)).body.data.title, '运行时项目')
    const editedProject = await call(`/admin/projects/${projectId}`, { ...createdProject.body.data, title: '运行时项目（已编辑）', status: 'published' }, admin.cookie, 'PATCH')
    assert.equal(editedProject.status, 200)
    assert.equal((await call(`/projects/${projectId}`)).body.data.title, '运行时项目（已编辑）')
    assert.equal((await call(`/admin/projects/${projectId}/offline`, {}, admin.cookie)).status, 200)
    assert.equal((await call(`/projects/${projectId}`)).status, 404)
    const publicProjectsAfterOffline = await call('/projects', undefined, admin.cookie)
    assert.equal(publicProjectsAfterOffline.body.data.some(item => item.id === projectId), false)
    assert.equal((await call('/admin/projects', undefined, admin.cookie)).body.data.find(item => item.id === projectId).status, 'offline')
    const created = await call('/resources', { team: 'software', visibility: 'team', title: 'Private source', summary: 'Restricted', body: 'secret source code' }, admin.cookie)
    assert.equal(created.status, 201)
    const id = created.body.data.id
    const listing = await call('/resources')
    assert.equal(listing.body.data.filter(item => !item.id.startsWith('git-')).length, 1)
    assert.ok(!JSON.stringify(listing.body).includes('secret source code'))
    for (const key of ['file', 'filename', 'size', 'mime', 'checksum', 'content_id']) assert.equal(Object.hasOwn(listing.body.data[0], key), false)
    assert.equal((await call(`/resources/${id}`)).status, 403)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).status, 403)
    assert.equal((await call('/admin/applications', undefined, pending.cookie)).status, 403)
    assert.equal((await call('/admin/members', undefined, pending.cookie)).status, 403)
    assert.equal((await call('/admin/site', undefined, pending.cookie)).status, 403)
    assert.equal((await call('/admin/audit', undefined, pending.cookie)).status, 403)
    const siteBefore = (await call('/site')).body.data
    assert.equal((await call('/admin/site', undefined, admin.cookie)).status, 200)
    const invalidHome = await call('/admin/site', { section: 'home', value: {} }, admin.cookie, 'PATCH')
    assert.equal(invalidHome.status, 400)
    const invalidLink = await call('/admin/site', { section: 'navigation', value: [{ path: 'javascript:alert(1)', label: '危险链接' }] }, admin.cookie, 'PATCH')
    assert.equal(invalidLink.status, 400)
    assert.equal(JSON.stringify((await call('/site')).body.data), JSON.stringify(siteBefore))
    assert.equal((await call('/admin/site', { section: 'brand', value: { ...siteBefore.brand, tagline: '测试内容' } }, admin.cookie, 'PATCH')).status, 200)
    assert.equal((await call('/site')).body.data.brand.tagline, '测试内容')
    const applications = (await call('/admin/applications', undefined, admin.cookie)).body.data
    assert.equal(applications.length, 1)
    assert.equal(applications[0].student_id, '25010720732')
    assert.equal(applications[0].username, 'lab_student')
    assert.equal(applications[0].grade, '25级')
    const reviewedApplicationId = applications[0].id
    assert.equal((await call(`/admin/applications/${applications[0].id}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).body.data.body, 'secret source code')
    assert.equal((await call(`/admin/applications/${applications[0].id}/review`, { status: 'rejected' }, admin.cookie)).status, 400)
    assert.equal((await call('/apply', { studentId: '25010720733', name: 'Other', password: applicant.password, team: 'hardware', statement: 'Hardware fan.' })).status, 201)
    const other = await call('/login', { account: '25010720733', password: applicant.password })
    assert.equal(other.body.data.grade, '25级')
    const otherId = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(a => a.student_id === '25010720733').id
    assert.equal((await call(`/admin/applications/${otherId}/review`, { status: 'approved' }, admin.cookie)).status, 200)
    assert.equal((await call(`/resources/${id}`, undefined, other.cookie)).status, 403)
    const members = (await call('/admin/members', undefined, admin.cookie)).body.data
    const otherMember = members.find(member => member.student_id === '25010720733')
    assert.equal(otherMember.is_active, 1)
    assert.equal((await call(`/admin/members/${otherMember.id}/status`, { isActive: false }, admin.cookie)).status, 200)
    assert.equal((await call('/login', { account: '25010720733', password: applicant.password })).status, 401)
    assert.equal((await call(`/admin/members/${otherMember.id}/status`, { isActive: true }, admin.cookie)).status, 200)
    const reset = await call(`/admin/members/${otherMember.id}/reset-password`, { password: 'reset-member-password-2026' }, admin.cookie)
    assert.equal(reset.status, 200)
    assert.equal(reset.body.activated, true)
    assert.equal((await call('/login', { account: '25010720733', password: applicant.password })).status, 401)
    const resetLogin = await call('/login', { account: '25010720733', password: 'reset-member-password-2026' })
    assert.equal(resetLogin.status, 200)
    assert.equal((await call(`/admin/members/${otherMember.id}/reset-password`, { password: 'reset-member-password-2026', extra: true }, admin.cookie)).status, 400)
    assert.equal((await call('/me', undefined, other.cookie)).body.data, null)
    assert.equal((await call(`/admin/members/${otherMember.id}/reset-password`, { password: 'short' }, admin.cookie)).status, 400)
    assert.equal((await call(`/admin/members/${admin.body.data.id}/reset-password`, { password: 'reset-admin-password-2026' }, admin.cookie)).status, 400)
    const edited = await call(`/resources/${id}`, { team: 'software', visibility: 'team', title: 'Private source updated', summary: 'Updated summary', body: 'Updated body' }, admin.cookie, 'PATCH')
    assert.equal(edited.status, 200)
    assert.equal((await call(`/resources/${id}`)).status, 403)
    const publicResource = await call('/resources', { team: 'hardware', visibility: 'public', title: 'Guide', summary: 'Intro', body: 'Open content' }, admin.cookie)
    assert.equal((await call(`/resources/${publicResource.body.data.id}`)).body.data.body, 'Open content')
    const adminResource = await call('/resources', { team: 'software', visibility: 'admin', title: 'Admin guide', summary: 'Internal operations', body: 'Admin-only content' }, admin.cookie)
    assert.equal(adminResource.status, 201)
    const anonymousResources = (await call('/resources')).body.data
    assert.equal(anonymousResources.some(resource => resource.id === adminResource.body.data.id), false)
    const memberResources = (await call('/resources', undefined, pending.cookie)).body.data
    assert.equal(memberResources.some(resource => resource.id === adminResource.body.data.id), false)
    assert.equal((await call('/admin/resources')).status, 403)
    assert.equal((await call('/admin/resources', undefined, pending.cookie)).status, 403)
    const adminResources = (await call('/admin/resources', undefined, admin.cookie)).body.data
    assert.equal(adminResources.some(resource => resource.id === adminResource.body.data.id), true)
    assert.equal((await call(`/resources/${adminResource.body.data.id}`)).status, 403)
    assert.equal((await call(`/resources/${adminResource.body.data.id}`, undefined, pending.cookie)).status, 403)
    assert.equal((await call(`/resources/${adminResource.body.data.id}`, undefined, admin.cookie)).body.data.body, 'Admin-only content')
    assert.equal((await call('/logout', {}, pending.cookie)).status, 200)
    const audit = (await call('/admin/audit', undefined, admin.cookie)).body.data
    const reviewAudit = audit.find(entry => entry.action === 'application.review' && entry.target_id === reviewedApplicationId)
    assert.ok(reviewAudit)
    assert.equal(reviewAudit.actor_id, admin.body.data.id)
    assert.ok(Number.isFinite(Date.parse(reviewAudit.created_at)))
    assert.deepEqual(reviewAudit.metadata, { from: 'pending', to: 'approved' })
    assert.ok(audit.some(entry => entry.action === 'resource.update'))
    assert.ok(audit.some(entry => entry.action === 'site.update'))
    assert.ok(audit.some(entry => entry.action === 'project.create'))
    assert.ok(audit.some(entry => entry.action === 'project.update'))
    assert.ok(audit.some(entry => entry.action === 'project.offline'))
    assert.equal(JSON.stringify(audit).includes('secret source code'), false)
    assert.equal(JSON.stringify(audit).includes('Student'), false)
    assert.equal((await call(`/resources/${id}`, undefined, pending.cookie)).status, 403)
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('legacy users schema migration keeps account activity state', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-platform-legacy-'))
  const dbPath = path.join(dir, 'legacy.sqlite')
  const legacy = spawnSync(process.execPath, ['-e', `
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(process.env.LEGACY_DB)
    db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member');")
    db.close()
  `], { env: { ...process.env, LEGACY_DB: dbPath }, encoding: 'utf8' })
  assert.equal(legacy.status, 0, legacy.stderr)
  const probe = spawnSync(process.execPath, ['-e', `
    process.env.LAB_DB_PATH = process.env.LEGACY_DB
    import('./server/platform.js').then(() => {
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(process.env.LEGACY_DB, { readOnly: true })
      const columns = db.prepare('PRAGMA table_info(users)').all().map(row => row.name)
      const row = db.prepare('SELECT is_active FROM users LIMIT 1').get()
      if (!columns.includes('student_id') || !columns.includes('is_active') || row) process.exitCode = 1
      db.close()
    }).catch(error => { console.error(error); process.exitCode = 1 })
  `], { env: { ...process.env, LEGACY_DB: dbPath }, encoding: 'utf8' })
  assert.equal(probe.status, 0, probe.stderr)
  rmSync(dir, { recursive: true, force: true })
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
    const oldStudentId = randomUUID()
    legacy.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(oldStudentId, 'oldstudent@example.org', 'Old Student', passwordHash, 'hardware', 'approved', 'member')
    legacy.exec('CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)')
    const { createHash } = await import('node:crypto')
    legacy.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update('legacy-token').digest('hex'), oldStudentId, Date.now() + 86400000)
    legacy.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), 'oldadmin@example.org', 'Old Admin', passwordHash, 'software', 'approved', 'admin')
    legacy.close()
    const migrated = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict'
      import * as platform from './server/platform.js'
      const admin = platform.login('oldadmin@example.org', 'legacy-password-2026')
      assert.equal(admin?.user.role, 'admin')
      assert.equal(admin.user.studentId, null)
      assert.equal(platform.currentUser('legacy-token').role, 'student')
      assert.equal(platform.currentUser('legacy-token').name, 'Old Student')
      assert.equal(platform.login('oldstudent@example.org', 'legacy-password-2026').user.role, 'student')
      platform.apply({ studentId: '24010720001', name: 'Newbie', password: 'newbie-password-2026', team: 'hardware', statement: 'hello' })
      const listed = platform.applications()
      assert.equal(listed.length, 1)
      assert.equal(listed[0].student_id, '24010720001')
      assert.equal(listed[0].grade, '24级')
      assert.equal(platform.login('24010720001', 'newbie-password-2026').user.grade, '24级')
    `], { env: { ...process.env, LAB_DB_PATH: dbFile }, encoding: 'utf8' })
    assert.equal(migrated.status, 0, migrated.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
