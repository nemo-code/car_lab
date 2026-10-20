import { execFileSync, spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { verifyPocketBaseBinary } from './verify-pocketbase.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const versionPath = path.join(repoRoot, 'pocketbase', 'version.json')
const hooksDir = path.join(repoRoot, 'pocketbase', 'pb_hooks')
const sourceMigrationsDir = path.join(repoRoot, 'pocketbase', 'pb_migrations')
const publicDir = path.join(repoRoot, 'public')

function password(label) {
  return `${label}-${randomBytes(18).toString('base64url')}`
}

export function parsePocketBaseVersion(output) {
  const match = String(output || '').match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?:\s|$)/)
  return match ? match[1] : ''
}

export function assertFixedVersion(output, expected) {
  const actual = parsePocketBaseVersion(output)
  if (!actual || actual !== expected) {
    throw new Error(`PocketBase 版本不匹配：需要 ${expected}，实际 ${actual || '未知'}`)
  }
  return actual
}

export function projectPayload(overrides = {}) {
  return {
    legacy_id: 'pb-project-assets-fixture',
    edition: 'runtime-fixture',
    slug: 'pb-project-assets-fixture',
    group_label: '隔离验收组',
    category: 'software',
    category_label: '软件作品',
    title: 'Project assets fixture',
    subtitle: 'PocketBase project asset runtime fixture',
    summary: 'Temporary fixture for project asset runtime validation.',
    tags: ['fixture'],
    highlights: ['legacy reference', 'multipart upload'],
    outcomes: ['controlled access'],
    tech: ['PocketBase'],
    members_text: 'Runtime validation',
    media: [{ label: '历史图片引用', path: 'assets/software-1.jpg' }],
    videos: [{ label: '历史视频引用', path: '../missing/legacy-fixture.mp4' }],
    files: [{ label: '历史文档引用', path: '../missing/legacy-fixture.pdf' }],
    accent: 'cyan',
    sort_order: 999,
    status: 'published',
    ...overrides,
  }
}

export function assetPayload(overrides = {}) {
  return {
    kind: 'image',
    label: 'Legacy asset reference',
    source_type: 'legacy',
    availability: 'available',
    legacy_path: 'assets/software-1.jpg',
    sort_order: 0,
    published: true,
    ...overrides,
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

export async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

function findBinary() {
  const candidates = [
    process.env.POCKETBASE_BINARY,
    path.join(repoRoot, '.runtime', 'bin', 'pocketbase'),
    path.join(repoRoot, 'pocketbase', 'pocketbase'),
  ].filter(Boolean)
  return candidates.find(filename => {
    try {
      execFileSync(filename, ['--version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }) || ''
}

function createSuperuser(binary, dataDir, migrationsDir, email, secret) {
  try {
    execFileSync(binary, [
      'superuser', 'create', email, secret,
      '--dir', dataDir,
      '--hooksDir', hooksDir,
      '--migrationsDir', migrationsDir,
      '--automigrate=true',
    ], { stdio: 'ignore', timeout: 30000 })
  } catch {
    throw new Error('PocketBase 隔离实例初始化失败；请检查固定版本二进制和迁移脚本。')
  }
}

async function waitForHealth(base, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error('PocketBase 隔离服务在健康检查前退出。')
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return
    } catch {
      // The server may need a few attempts while migrations finish.
    }
    await sleep(100)
  }
  throw new Error('PocketBase 隔离服务健康检查超时。')
}

async function request(base, pathname, options = {}, token = '') {
  const response = await fetch(`${base}/api${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch { payload = {} }
  return { status: response.status, payload, headers: response.headers }
}

function expectStatus(result, expected, label) {
  if (result.status !== expected) throw new Error(`${label} 返回 ${result.status}，需要 ${expected}${result.payload?.message ? `：${result.payload.message}` : ''}`)
  return result
}

async function login(base, collection, identity, secret) {
  const result = await request(base, `/collections/${collection}/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity, password: secret }),
  })
  expectStatus(result, 200, `${collection} 登录`)
  if (!result.payload.token || !result.payload.record?.id) throw new Error(`${collection} 登录未返回 Token`)
  return result.payload
}

async function uploadAsset(base, projectId, token, filename, bytes) {
  const form = new FormData()
  for (const [key, value] of Object.entries({
    kind: 'image',
    label: 'Uploaded hero image',
    source_type: 'upload',
    availability: 'available',
    legacy_path: '',
    sort_order: '1',
    published: 'true',
  })) form.set(key, value)
  form.append('file', new Blob([bytes], { type: 'image/png' }), filename)
  return request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`, { method: 'POST', body: form }, token)
}

async function createLegacyAsset(base, projectId, token, overrides = {}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(assetPayload(overrides))) form.set(key, String(value))
  return request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`, { method: 'POST', body: form }, token)
}

async function replaceAsset(base, assetId, token, filename, bytes) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'image/png' }), filename)
  return request(base, `/lab/project-assets/${encodeURIComponent(assetId)}/file`, { method: 'POST', body: form }, token)
}

async function uploadResourceFile(base, resourceId, token, filename, bytes) {
  const form = new FormData()
  form.set('resource', resourceId)
  form.set('body', 'Public resource fixture')
  form.set('filename', filename)
  form.set('size', String(bytes.length))
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename)
  return request(base, `/lab/resources/${encodeURIComponent(resourceId)}/file`, { method: 'POST', body: form }, token)
}

async function directFile(base, url) {
  const response = await fetch(new URL(url, base))
  const bytes = Buffer.from(await response.arrayBuffer())
  return { status: response.status, bytes }
}

function recordById(records, id) {
  return (records || []).find(record => record.id === id) || null
}

async function createBusinessAdmin(base, superToken, teamId) {
  const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const secret = password('ProjectAssetsAdmin')
  const identity = `29${String(Date.now()).slice(-9)}`
  const created = await request(base, '/collections/users/records', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `project-assets-admin-${stamp}@example.invalid`,
      password: secret,
      passwordConfirm: secret,
      name: 'Project Assets Admin',
      student_id: identity,
      username: `paadmin${String(Date.now()).slice(-8)}`,
      grade: '29级',
      primary_team: teamId,
      status: 'approved',
      role: 'admin',
      is_active: true,
    }),
  }, superToken)
  expectStatus(created, 200, '业务管理员初始化')
  const auth = await login(base, 'users', identity, secret)
  return { id: created.payload.id, token: auth.token }
}

async function runFlow(base, superToken) {
  const teams = await request(base, '/collections/teams/records?filter=code%20%3D%20%22software%22&perPage=1', {}, superToken)
  expectStatus(teams, 200, '软件团队查询')
  const teamId = teams.payload.items?.[0]?.id
  if (!teamId) throw new Error('隔离实例缺少 software 团队')

  const admin = await createBusinessAdmin(base, superToken, teamId)
  const publicResource = await request(base, '/lab/resources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team: teamId, title: 'Public resource fixture', summary: 'Public resource attachment fixture.', visibility: 'public', body: 'Public resource body', filename: 'public-fixture.pdf', size: 0 }),
  }, admin.token)
  expectStatus(publicResource, 201, '公开资源新建')
  const publicResourceId = publicResource.payload.resource.id
  const publicBytes = Buffer.from('%PDF-1.4 public fixture\n')
  const publicUpload = await uploadResourceFile(base, publicResourceId, admin.token, 'public-fixture.pdf', publicBytes)
  expectStatus(publicUpload, 200, '公开资源附件上传')
  const publicContent = await request(base, `/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(publicResourceId)}%22&perPage=1`)
  expectStatus(publicContent, 200, '公开资源附件匿名查询')
  const publicContentRecord = publicContent.payload.items?.[0]
  if (!publicContentRecord?.id || !publicContentRecord.file) throw new Error('公开资源附件未返回匿名文件名')
  const publicFile = await directFile(base, `/api/files/resource_contents/${encodeURIComponent(publicContentRecord.id)}/${encodeURIComponent(publicContentRecord.file)}`)
  expectStatus(publicFile, 200, '公开资源附件匿名下载')
  if (!publicFile.bytes.equals(publicBytes)) throw new Error('公开资源附件内容不匹配')
  await request(base, `/lab/resources/${encodeURIComponent(publicResourceId)}/offline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, admin.token)
  const initial = projectPayload()
  const superuserWrite = await request(base, '/lab/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(initial),
  }, superToken)
  expectStatus(superuserWrite, 403, '超级管理员 Token 越权写入拒绝')

  const created = await request(base, '/lab/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(initial),
  }, admin.token)
  expectStatus(created, 201, '项目新建')
  const projectId = created.payload.id
  if (!projectId) throw new Error('项目新建未返回 id')

  const projectRecord = await request(base, `/collections/projects/records/${encodeURIComponent(projectId)}`, {}, {})
  expectStatus(projectRecord, 200, '公开项目详情')
  if (projectRecord.payload.legacy_id !== initial.legacy_id || projectRecord.payload.media?.[0]?.path !== initial.media[0].path) {
    throw new Error('项目 legacy 引用未保留')
  }

  const edited = await request(base, `/lab/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(projectPayload({ title: 'Project assets fixture edited', summary: 'Edited runtime fixture.' })),
  }, admin.token)
  expectStatus(edited, 200, '项目编辑')
  if (edited.payload.title !== 'Project assets fixture edited') throw new Error('项目编辑结果不匹配')

  const publicProjects = await request(base, '/collections/projects/records?filter=status%20%3D%20%22published%22&perPage=200')
  expectStatus(publicProjects, 200, '公开项目列表')
  if (!recordById(publicProjects.payload.items, projectId)) throw new Error('已发布项目未出现在公开列表')

  const legacy = await createLegacyAsset(base, projectId, admin.token)
  expectStatus(legacy, 201, 'legacy 素材引用创建')
  if (legacy.payload.source_type !== 'legacy' || legacy.payload.legacy_path !== 'assets/software-1.jpg') throw new Error('legacy 素材引用字段不匹配')
  const unavailableLegacy = await createLegacyAsset(base, projectId, admin.token, {
    label: '不存在的历史图片', legacy_path: 'assets/does-not-exist.png', sort_order: 2,
  })
  expectStatus(unavailableLegacy, 400, '不存在的 legacy 素材拒绝发布')

  const legacyPublic = await request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`)
  expectStatus(legacyPublic, 200, 'legacy 素材公开列表')
  if (!recordById(legacyPublic.payload.data, legacy.payload.id)) throw new Error('legacy 素材未出现在公开列表')

  const uploadBytes = Buffer.from('project-assets-fixture-v1')
  const uploaded = await uploadAsset(base, projectId, admin.token, 'hero-v1.png', uploadBytes)
  expectStatus(uploaded, 201, 'multipart 素材上传')
  if (!uploaded.payload.filename || uploaded.payload.published !== true || uploaded.payload.availability !== 'available') throw new Error('multipart 素材状态不匹配')
  const uploadedUrl = uploaded.payload.url
  const uploadedFile = await directFile(base, uploadedUrl)
  expectStatus(uploadedFile, 200, '公开素材文件访问')
  if (!uploadedFile.bytes.equals(uploadBytes)) throw new Error('公开素材文件内容不匹配')

  const publicAssets = await request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`)
  expectStatus(publicAssets, 200, '上传素材公开列表')
  if (!recordById(publicAssets.payload.data, uploaded.payload.id)) throw new Error('上传素材未出现在公开列表')

  const replacementBytes = Buffer.from('project-assets-fixture-v2')
  const replaced = await replaceAsset(base, uploaded.payload.id, admin.token, 'hero-v2.png', replacementBytes)
  expectStatus(replaced, 200, '素材替换')
  if (replaced.payload.published !== false || !replaced.payload.filename || replaced.payload.filename === uploaded.payload.filename || !replaced.payload.filename.endsWith('.png')) {
    throw new Error(`素材替换后状态不匹配：${JSON.stringify(replaced.payload)}`)
  }
  const publicAfterReplace = await request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`)
  expectStatus(publicAfterReplace, 200, '替换后公开素材列表')
  if (recordById(publicAfterReplace.payload.data, uploaded.payload.id)) throw new Error('替换后素材仍出现在公开列表')
  const oldFileAfterReplace = await directFile(base, uploadedUrl)
  if (oldFileAfterReplace.status !== 404) throw new Error(`替换后旧文件仍可访问：${oldFileAfterReplace.status}`)
  const unpublishedReplacement = await directFile(base, replaced.payload.url)
  if (unpublishedReplacement.status !== 404) throw new Error(`替换后未发布文件仍可访问：${unpublishedReplacement.status}`)

  const republished = await request(base, `/lab/project-assets/${encodeURIComponent(uploaded.payload.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(assetPayload({
      label: 'Uploaded hero image', source_type: 'upload', legacy_path: '', sort_order: 1, published: true,
    })),
  }, admin.token)
  expectStatus(republished, 200, '替换后重新发布')
  if (republished.payload.published !== true || !republished.payload.filename || republished.payload.filename === uploaded.payload.filename) throw new Error('替换后重新发布状态不匹配')
  const replacementFile = await directFile(base, republished.payload.url)
  expectStatus(replacementFile, 200, '替换后公开文件访问')
  if (!replacementFile.bytes.equals(replacementBytes)) throw new Error('替换后文件内容不匹配')

  const offline = await request(base, `/lab/project-assets/${encodeURIComponent(uploaded.payload.id)}/offline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }, admin.token)
  expectStatus(offline, 200, '素材下线')
  if (offline.payload.availability !== 'offline' || offline.payload.published !== false || offline.payload.filename) throw new Error('素材下线未清除公开状态')
  const publicAfterOffline = await request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`)
  expectStatus(publicAfterOffline, 200, '下线后公开素材列表')
  if (recordById(publicAfterOffline.payload.data, uploaded.payload.id)) throw new Error('下线素材仍出现在公开列表')
  const fileAfterOffline = await directFile(base, republished.payload.url)
  if (fileAfterOffline.status !== 404) throw new Error(`下线后文件仍可访问：${fileAfterOffline.status}`)

  const projectOffline = await request(base, `/lab/projects/${encodeURIComponent(projectId)}/offline`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }, admin.token)
  expectStatus(projectOffline, 200, '项目下线')
  const publicAfterProjectOffline = await request(base, '/collections/projects/records?filter=status%20%3D%20%22published%22&perPage=200')
  expectStatus(publicAfterProjectOffline, 200, '项目下线后公开列表')
  if (recordById(publicAfterProjectOffline.payload.items, projectId)) throw new Error('下线项目仍出现在公开列表')
  const assetsAfterProjectOffline = await request(base, `/lab/projects/${encodeURIComponent(projectId)}/assets`)
  if (assetsAfterProjectOffline.status !== 400) throw new Error(`下线项目素材访问返回 ${assetsAfterProjectOffline.status}`)

  return {
    pass: true,
    project: { created: true, edited: true, legacyReferences: true, publishedListed: true, offlineHidden: true },
    assets: { legacyListed: true, missingLegacyRejected: true, multipartListed: true, publicFile: 200, replacementUnpublished: true, replacementFile: 200, offlineRejected: 404 },
    authorization: { superuserRoute: superuserWrite.status, businessAdminRoute: true },
    publicResourceFile: 200,
  }
}

export async function verifyProjectAssets(options = {}) {
  const version = JSON.parse(await readFile(versionPath, 'utf8'))
  const binary = options.binary || findBinary()
  if (!binary) throw new Error('未找到固定版本 PocketBase 二进制；请设置 POCKETBASE_BINARY。')
  let versionOutput
  try { versionOutput = execFileSync(binary, ['--version'], { encoding: 'utf8' }) } catch { throw new Error('无法读取 PocketBase 二进制版本。') }
  assertFixedVersion(versionOutput, version.version)
  await verifyPocketBaseBinary(binary, version)

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'car-lab-project-assets-'))
  const dataDir = path.join(tempRoot, 'pb_data')
  const migrationsDir = path.join(tempRoot, 'pb_migrations')
  await Promise.all([
    mkdir(dataDir, { recursive: true }),
    cp(sourceMigrationsDir, migrationsDir, { recursive: true }),
  ])
  const email = `project-assets-super-${Date.now()}@example.invalid`
  const secret = password('ProjectAssetsSuper')
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  let child
  try {
    createSuperuser(binary, dataDir, migrationsDir, email, secret)
    child = spawn(binary, [
      'serve', '--http', `127.0.0.1:${port}`, '--dir', dataDir,
      '--hooksDir', hooksDir, '--migrationsDir', migrationsDir, '--publicDir', publicDir,
      '--automigrate=true', '--hooksWatch=false', ...(process.env.POCKETBASE_DEBUG ? ['--dev'] : []),
    ], { stdio: process.env.POCKETBASE_DEBUG ? 'inherit' : 'ignore' })
    await waitForHealth(base, child)
    const superAuth = await login(base, '_superusers', email, secret)
    return await runFlow(base, superAuth.token)
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise(resolve => child.once('exit', resolve))
    }
    await rm(tempRoot, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifyProjectAssets()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.pass ? 0 : 1
  } catch {
    process.stderr.write('PocketBase project_assets 隔离运行验证失败。\n')
    process.exitCode = 2
  }
}
