import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

test('project assets preserve legacy references and enforce upload visibility', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-project-assets-'))
  const env = { ...process.env, LAB_DB_PATH: path.join(dir, 'test.sqlite'), HOST: '127.0.0.1', LAB_REQUIRE_HTTPS: '1' }
  const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', 'admin@example.org'], { env, input: 'long-admin-password-2026\n', encoding: 'utf8' })
  assert.equal(bootstrap.status, 0, bootstrap.stderr)
  const port = await new Promise(resolve => {
    const listener = net.createServer()
    listener.listen(0, '127.0.0.1', () => { const value = listener.address().port; listener.close(() => resolve(value)) })
  })
  const server = spawn(process.execPath, ['server/index.js'], { env: { ...env, PORT: String(port) }, stdio: 'pipe' })
  const base = `http://127.0.0.1:${port}/api`
  const call = async (endpoint, options = {}) => {
    const headers = { 'X-Forwarded-Proto': 'https', ...(options.headers || {}) }
    const response = await fetch(base + endpoint, { ...options, headers })
    const contentType = response.headers.get('content-type') || ''
    const body = contentType.includes('application/json')
      ? await response.json()
      : contentType.startsWith('image/') ? Buffer.from(await response.arrayBuffer()) : await response.text()
    return { status: response.status, body, cookie: response.headers.get('set-cookie')?.split(';')[0], response }
  }
  try {
    let ready = false
    for (let i = 0; i < 60; i++) {
      try { if ((await call('/health')).status === 200) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 30))
    }
    assert.ok(ready, 'server did not start')
    const admin = await call('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'admin@example.org', password: 'long-admin-password-2026' }) })
    assert.equal(admin.status, 200)
    const cookie = admin.cookie
    const publicBefore = await call('/projects/hw1/assets')
    assert.equal(publicBefore.status, 200)
    assert.equal(publicBefore.body.data.length, 4)
    assert.ok(publicBefore.body.data.every(asset => asset.kind === 'image' && asset.source_type === 'legacy' && asset.availability === 'available'))
    const projectResponse = await call('/projects/hw1')
    assert.equal(projectResponse.status, 200)
    assert.equal(projectResponse.body.data.assets.length, 4)

    const adminBefore = await call('/admin/projects/hw1/assets', { headers: { Cookie: cookie } })
    assert.equal(adminBefore.status, 200)
    assert.equal(adminBefore.body.data.length, 8)
    assert.ok(adminBefore.body.data.some(asset => asset.kind === 'video' && asset.availability === 'missing' && !asset.published))

    const missing = await call('/admin/projects/hw1/assets', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'video', label: '待补充演示', source_type: 'legacy', availability: 'missing', legacy_path: '../missing/demo.mp4', published: false }),
    })
    assert.equal(missing.status, 201)
    const unavailablePublished = await call('/admin/projects/hw1/assets', {
      method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'image', label: '不存在的公开素材', source_type: 'legacy', availability: 'available', legacy_path: 'assets/does-not-exist.png', published: true }),
    })
    assert.equal(unavailablePublished.status, 400)
    assert.equal((await call('/projects/hw1/assets')).body.data.length, 4)

    const form = new FormData()
    form.set('kind', 'image')
    form.set('label', '运行时图片')
    form.set('source_type', 'upload')
    form.set('availability', 'available')
    form.set('published', 'true')
    form.set('sort_order', '50')
    const pngFixture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pS8AAAAASUVORK5CYII=', 'base64')
    form.append('file', new Blob([pngFixture], { type: 'image/png' }), 'runtime.png')
    const uploaded = await call('/admin/projects/hw1/assets', { method: 'POST', headers: { Cookie: cookie }, body: form })
    assert.equal(uploaded.status, 201)
    assert.equal(uploaded.body.data.mime, 'image/png')
    assert.equal(uploaded.body.data.published, true)
    const assetFile = await call(uploaded.body.data.url.slice('/api'.length))
    assert.equal(assetFile.status, 200)
    assert.deepEqual(assetFile.body, pngFixture)
    assert.match(assetFile.response.headers.get('content-disposition') || '', /^inline;/)
    assert.equal(assetFile.response.headers.get('x-content-type-options'), 'nosniff')

    const textForm = new FormData()
    textForm.set('kind', 'file')
    textForm.set('label', '可下载文本')
    textForm.set('source_type', 'upload')
    textForm.set('availability', 'available')
    textForm.set('published', 'true')
    textForm.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/plain' }), 'notes.txt')
    const textAsset = await call('/admin/projects/hw1/assets', { method: 'POST', headers: { Cookie: cookie }, body: textForm })
    assert.equal(textAsset.status, 201)
    const textFile = await call(textAsset.body.data.url.slice('/api'.length))
    assert.equal(textFile.status, 200)
    assert.equal(textFile.body, '<script>alert(1)</script>')
    assert.match(textFile.response.headers.get('content-disposition') || '', /^attachment;/)
    assert.equal(textFile.response.headers.get('x-content-type-options'), 'nosniff')

    const badForm = new FormData()
    badForm.set('kind', 'image')
    badForm.set('label', '不允许')
    badForm.set('source_type', 'upload')
    badForm.set('availability', 'available')
    badForm.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'text/html' }), 'bad.html')
    assert.equal((await call('/admin/projects/hw1/assets', { method: 'POST', headers: { Cookie: cookie }, body: badForm })).status, 400)
    const forgedImage = new FormData()
    forgedImage.set('kind', 'image')
    forgedImage.set('label', '伪造图片内容')
    forgedImage.set('source_type', 'upload')
    forgedImage.set('availability', 'available')
    forgedImage.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'forged.png')
    assert.equal((await call('/admin/projects/hw1/assets', { method: 'POST', headers: { Cookie: cookie }, body: forgedImage })).status, 400)
    assert.equal((await call('/admin/projects/hw1/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'file', label: '越权', source_type: 'legacy', availability: 'missing', legacy_path: '../x' }) })).status, 403)

    const offline = await call(`/admin/project-assets/${uploaded.body.data.id}/offline`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(offline.status, 200)
    assert.equal((await call(`/admin/project-assets/${textAsset.body.data.id}/offline`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 200)
    assert.equal((await call('/projects/hw1/assets')).body.data.length, 4)
    assert.equal((await call(uploaded.body.data.url.slice('/api'.length))).status, 404)
    assert.equal((await call(textAsset.body.data.url.slice('/api'.length))).status, 404)
    const audit = (await call('/admin/audit', { headers: { Cookie: cookie } })).body.data
    assert.ok(audit.some(entry => entry.action === 'project_asset.create'))
    assert.ok(audit.some(entry => entry.action === 'project_asset.offline'))
  } finally {
    if (server.exitCode === null) {
      server.kill()
      await new Promise(resolve => server.once('exit', resolve))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
