import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('teachers, team assignments, resource uploads, private downloads and persistence', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-workflows-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'test.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  assert.equal(spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'admin-password-for-test\n', encoding: 'utf8' }).status, 0)
  const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) }) })
  let server
  const base = `http://127.0.0.1:${port}/api`
  async function start() {
    server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'pipe' })
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(base + '/health')).ok) return } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error('Server did not start')
  }
  async function stop() { if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => server.once('exit', resolve)) } }
  async function call(route, data, cookie) {
    const res = await fetch(base + route, { method: data === undefined ? 'GET' : 'POST', headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }
  }
  const upload = (cookie, purpose, name, content, headers = {}) => fetch(base + `/uploads?purpose=${purpose}&name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/octet-stream', ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: content })
  const download = (url, cookie) => fetch(base.replace(/\/api$/, '') + url, { headers: { 'X-Forwarded-Proto': 'https', ...(cookie ? { Cookie: cookie } : {}) } })
  try {
    await start()
    const catalog = (await call('/resources')).body.data.filter(r => r.id.startsWith('git-'))
    assert.equal(catalog.length, 10)
    const entry = (await call('/resources/git-showcase')).body.data
    assert.ok(entry.attachments.some(f => f.mime === 'video/mp4'))
    for (const file of entry.attachments) {
      const res = await download(file.url)
      assert.equal(res.status, 200, file.url)
      if (file.mime.startsWith('image/')) assert.match(res.headers.get('content-type'), /^image\//)
    }
    const admin = (await call('/login', { account: 'admin@example.org', password: 'admin-password-for-test' })).cookie
    assert.equal((await call('/apply', { role: 'admin', studentId: '25010720730', name: 'Fake', password: '123456', team: 'software' })).status, 400)
    const teacherData = { role: 'teacher', name: '老师甲', email: 'teacher@example.org', username: 'teacher_a', password: '123456', team: 'software' }
    assert.equal((await call('/apply', { ...teacherData, email: 'invalid' })).status, 400)
    assert.equal((await call('/apply', teacherData)).status, 201)
    assert.equal((await call('/apply', teacherData)).status, 400)
    const teacher = await call('/login', { account: teacherData.email, password: '123456' })
    assert.equal(teacher.body.data.role, 'teacher')
    assert.equal(teacher.body.data.studentId, null)
    assert.equal((await call('/assignments', undefined, teacher.cookie)).status, 403)
    assert.equal((await upload(teacher.cookie, 'submission', '待审核.txt', 'not approved')).status, 403)
    const teacherApp = (await call('/admin/applications', undefined, admin)).body.data.find(a => a.email === teacherData.email)
    assert.equal(teacherApp.role, 'teacher')
    assert.equal((await call(`/admin/applications/${teacherApp.id}/review`, { status: 'approved' }, admin)).status, 200)
    const studentCookies = []
    for (const [i, team] of ['software','hardware','simulation'].entries()) {
      const studentId = `2501072073${i}`
      assert.equal((await call('/apply', { studentId, name: team, team, password: '123456' })).status, 201)
      const login = await call('/login', { account: studentId, password: '123456' })
      assert.equal(login.body.data.role, 'student')
      const application = (await call('/admin/applications', undefined, admin)).body.data.find(a => a.student_id === studentId)
      await call(`/admin/applications/${application.id}/review`, { status: 'approved' }, admin)
      studentCookies.push(login.cookie)
    }
    const [student, other, game] = studentCookies
    assert.equal((await upload(null, 'submission', 'anonymous.txt', 'blocked')).status, 403)
    assert.equal((await upload(student, 'resource', 'student.txt', 'blocked')).status, 403)
    assert.equal((await upload(teacher.cookie, 'resource', 'teacher.txt', 'blocked')).status, 403)
    for (const name of ['bad.html', 'bad.svg', '../secret.txt', 'bad.exe']) assert.equal((await upload(admin, 'resource', name, 'invalid')).status, 400)
    assert.equal((await upload(admin, 'resource', 'fake.png', '<script>bad</script>')).status, 400)
    assert.equal((await upload(admin, 'resource', 'empty.txt', '')).status, 400)
    assert.equal((await upload(admin, 'resource', 'cross.txt', 'x', { Origin: 'https://evil.example' })).status, 403)
    assert.equal((await upload(admin, 'resource', 'big.zip', Buffer.alloc(20 * 1024 * 1024 + 1))).status, 413)
    const png = readFileSync('public/picture1.png')
    const picture = (await (await upload(admin, 'resource', '接线图.png', png)).json()).data
    assert.equal((await download(picture.url, other)).status, 403)
    const drop = (id, cookie) => fetch(base + '/uploads/' + id, { method:'DELETE',headers:{'X-Forwarded-Proto':'https','Content-Type':'application/json',Cookie:cookie},body:'{}' })
    assert.equal((await drop(picture.id, other)).status,403)
    const temporary = (await (await upload(admin, 'resource', 'temporary.txt', 'temp')).json()).data
    assert.equal((await drop(temporary.id, admin)).status,200)
    assert.equal((await download(temporary.url,admin)).status,404)
    assert.equal((await download(picture.url)).status, 403) // unbound files remain private
    const privateResource = await call('/resources', { team:'software', visibility:'team', title:'内部接线图', summary:'仅本组', attachments:[picture.id] }, admin)
    assert.equal(privateResource.status, 201)
    const rid = privateResource.body.data.id
    assert.equal((await drop(picture.id, admin)).status,403)
    assert.equal((await download(picture.url)).status, 403)
    assert.equal((await download(picture.url, other)).status, 403)
    const imageResponse = await download(picture.url, student)
    assert.equal(imageResponse.status, 200)
    assert.equal(imageResponse.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png)
    assert.equal((await download(picture.url, teacher.cookie)).status, 200)
    assert.equal((await call(`/resources/${rid}`, undefined, student)).body.data.attachments[0].name, '接线图.png')
    assert.equal((await call('/resources', { team:'software',visibility:'public',title:'重复',summary:'重复',attachments:[picture.id] }, admin)).status,400)
    const doc = (await (await upload(admin, 'resource', '实验指导.pdf', '%PDF-1.4 test')).json()).data
    assert.equal((await call('/resources', { team:'hardware', visibility:'public', title:'公开文档',summary:'文档',attachments:[doc.id] }, admin)).status, 201)
    const pdf = await download(doc.url)
    assert.equal(pdf.status, 200); assert.match(pdf.headers.get('content-disposition'), /^attachment;/)
    const task = await call('/assignments', { title:'软件实验', body:'上传图片和报告', team:'software' }, teacher.cookie)
    assert.equal(task.status,201)
    const aid = task.body.data.id
    assert.equal((await call('/assignments', { title:'越权',body:'x',team:'all' }, student)).status,403)
    assert.equal((await call('/assignments', { title:'坏日期',body:'x',team:'all', dueAt:'2000-01-01' }, admin)).status,400)
    assert.equal((await call('/assignments',undefined,other)).body.data.length,0)
    assert.equal((await call('/assignments',undefined,game)).body.data.length,0)
    const work = (await (await upload(student, 'submission', '作业报告.txt', 'private homework')).json()).data
    assert.equal((await call(`/assignments/${aid}/submissions`, { body:'越组' }, other)).status,400)
    assert.equal((await call(`/assignments/${aid}/submissions`, { attachments:[work.id] }, other)).status,400)
    assert.equal((await call(`/assignments/${aid}/submissions`, { body:'' }, student)).status,400)
    assert.equal((await call(`/assignments/${aid}/submissions`, { body:'完成',attachments:[work.id] }, student)).status,201)
    assert.equal((await download(work.url)).status,403)
    assert.equal((await download(work.url,other)).status,403)
    assert.equal((await download(work.url,teacher.cookie)).status,200)
    assert.equal((await download(work.url,student)).status,200)
    assert.equal((await call('/submissions',undefined,other)).body.data.length,0)
    assert.equal((await call('/submissions',undefined,student)).body.data.length,1)
    assert.equal((await call('/submissions',undefined,teacher.cookie)).body.data.length,1)
    assert.equal((await call(`/assignments/${aid}/submissions`, { body:'老师提交' }, teacher.cookie)).status,201)
    assert.equal((await call(`/assignments/${aid}/submissions`, { body:'学生再次提交' }, student)).status,201)
    assert.equal((await call('/submissions',undefined,student)).body.data.length,2)
    const allTask = await call('/assignments', { title:'公共作业',body:'三组可提交',team:'all' }, admin)
    assert.equal(allTask.status,201)
    assert.ok((await call('/assignments',undefined,game)).body.data.some(a => a.id === allTask.body.data.id))
    // Deadline checks happen on the server, even if a stale client keeps its form open.
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(env.LAB_DB_PATH)
    db.prepare('UPDATE assignments SET due_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z',aid); db.close()
    assert.equal((await call(`/assignments/${aid}/submissions`, { body:'late' }, student)).status,400)
    await stop(); await start()
    assert.equal((await call('/me',undefined,teacher.cookie)).body.data.role,'teacher')
    assert.equal((await call('/submissions',undefined,student)).body.data.length,2)
    assert.equal((await download(work.url,student)).status,200)
  } finally { await stop(); rmSync(dir,{recursive:true,force:true}) }
})
