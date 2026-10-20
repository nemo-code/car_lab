import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('teams are seeded, publicly readable and administrator editable', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-teams-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'teams.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'long-admin-password-2026\n', encoding: 'utf8' })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const port = await new Promise(resolve => {
    const listener = net.createServer()
    listener.listen(0, '127.0.0.1', () => { const value = listener.address().port; listener.close(() => resolve(value)) })
  })
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
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { if ((await call('/health')).status === 200) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'server did not start')
    const publicTeams = await call('/teams')
    assert.equal(publicTeams.status, 200)
    assert.deepEqual(publicTeams.body.data.map(team => team.id), ['software', 'hardware', 'simulation'])
    assert.equal(publicTeams.body.data[0].learn.length, 3)
    const admin = await call('/login', { account: 'admin@example.org', password: 'long-admin-password-2026' })
    assert.equal(admin.status, 200)
    assert.equal((await call('/admin/teams', undefined, admin.cookie)).body.data.length, 3)
    const update = await call('/admin/teams/software', {
      name: '软件与数据团队', caption: '把车辆数据变成可用体验', image: '/projects/xiaoxueqi-2026/photos/软件1.png',
      intro: '更新后的团队介绍。', learn: ['车载应用开发', '数据链路', '视觉交互'], practice: '更新后的实践方式。', sort_order: 1, enabled: true,
    }, admin.cookie, 'PATCH')
    assert.equal(update.status, 200)
    assert.equal((await call('/teams/software')).body.data.name, '软件与数据团队')

    const pendingForDisabledTeam = await call('/apply', {
      studentId: '26000000101', username: 'disabledreview', name: 'Disabled Review',
      password: 'student-password-2026', team: 'software', statement: 'Please review.',
    })
    assert.equal(pendingForDisabledTeam.status, 201)
    const memberForSecondApplication = await call('/apply', {
      studentId: '26000000102', username: 'disabledsecond', name: 'Disabled Second',
      password: 'student-password-2026', team: 'hardware', statement: 'Hardware application.',
    })
    assert.equal(memberForSecondApplication.status, 201)
    const memberLogin = await call('/login', { account: 'disabledsecond', password: 'student-password-2026' })
    assert.equal(memberLogin.status, 200)

    for (const team of ['software', 'hardware', 'simulation']) {
      const current = (await call('/admin/teams', undefined, admin.cookie)).body.data.find(item => item.id === team)
      const disabled = await call(`/admin/teams/${team}`, { name: current.name, caption: current.caption, image: current.image, intro: current.intro, learn: current.learn, practice: current.practice, sort_order: current.sort_order, enabled: false }, admin.cookie, 'PATCH')
      assert.equal(disabled.status, 200)
    }

    const applicationsBeforeDisabledAttempt = (await call('/admin/applications', undefined, admin.cookie)).body.data.length
    const membersBeforeDisabledAttempt = (await call('/admin/members', undefined, admin.cookie)).body.data.length
    const firstApplicationToDisabledTeam = await call('/apply', {
      studentId: '26000000103', username: 'disabledfirst', name: 'Disabled First',
      password: 'student-password-2026', team: 'software', statement: 'Should be rejected.',
    })
    assert.equal(firstApplicationToDisabledTeam.status, 400)
    assert.equal((await call('/admin/applications', undefined, admin.cookie)).body.data.length, applicationsBeforeDisabledAttempt)
    assert.equal((await call('/admin/members', undefined, admin.cookie)).body.data.length, membersBeforeDisabledAttempt)
    const secondApplicationToDisabledTeam = await call('/apply-team', { team: 'software', statement: 'Should be rejected.' }, memberLogin.cookie)
    assert.equal(secondApplicationToDisabledTeam.status, 400)
    const pending = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(item => item.id === pendingForDisabledTeam.body.data.id)
    assert.equal(pending.status, 'pending')
    const approvalForDisabledTeam = await call(`/admin/applications/${pending.id}/review`, { status: 'approved' }, admin.cookie)
    assert.equal(approvalForDisabledTeam.status, 400)
    const pendingAfterRejectedApproval = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(item => item.id === pending.id)
    assert.equal(pendingAfterRejectedApproval.status, 'pending')
    assert.equal((await call(`/admin/applications/${pending.id}/review`, { status: 'rejected' }, admin.cookie)).status, 200)
    const rejectedAfterTeamDisabled = (await call('/admin/applications', undefined, admin.cookie)).body.data.find(item => item.id === pending.id)
    assert.equal(rejectedAfterTeamDisabled.status, 'rejected')

    assert.deepEqual((await call('/teams')).body.data, [])
    assert.equal((await call('/admin/teams', undefined, admin.cookie)).body.data.length, 3)
    const audit = (await call('/admin/audit', undefined, admin.cookie)).body.data
    assert.ok(audit.some(entry => entry.action === 'team.update'))
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
