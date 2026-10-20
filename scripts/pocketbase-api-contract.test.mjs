import assert from 'node:assert/strict'
import test from 'node:test'
import {
  apiBaseUrl,
  normalizeApplication,
  normalizeResource,
  normalizeUser,
  protectedFileUrl,
} from '../src/api/pocketbase-contract.js'
import { normalizeProject, projectPayload } from '../src/api/project-contract.js'

test('PocketBase user records map to the existing member shape', () => {
  const user = normalizeUser({
    id: 'user123',
    student_id: '25010720732',
    username: 'lin',
    name: 'Lin',
    grade: '25级',
    primary_team: 'team123',
    is_active: true,
    status: 'approved',
    role: 'member',
    expand: {
      primary_team: { id: 'team123', code: 'software' },
      memberships: [{ id: 'membership123', team: 'team456', status: 'approved', is_active: true, expand: { team: { id: 'team456', code: 'hardware' } } }],
    },
  })
  assert.equal(user.studentId, '25010720732')
  assert.equal(user.student_id, '25010720732')
  assert.equal(user.team, 'software')
  assert.equal(user.isActive, true)
  assert.equal(user.is_active, true)
  assert.deepEqual(user.memberships, [{
    id: 'membership123',
    user_id: 'user123',
    team: 'hardware',
    status: 'approved',
    role: 'member',
    is_active: true,
    joined_at: null,
    reviewed_at: null,
  }])
})

test('PocketBase application and resource records preserve admin view fields', () => {
  const application = normalizeApplication({
    id: 'application123',
    statement: 'join',
    status: 'pending',
    created: '2026-10-17 00:00:00.000Z',
    user: 'user123',
    team: 'team123',
    expand: {
      user: { id: 'user123', name: 'Lin', student_id: '25010720732', grade: '25级', username: 'lin' },
      team: { id: 'team123', code: 'software' },
    },
  })
  assert.equal(application.student_id, '25010720732')
  assert.equal(application.team, 'software')
  assert.equal(application.created_at, '2026-10-17 00:00:00.000Z')

  const resource = normalizeResource(
    {
      id: 'resource123',
      title: 'Guide',
      summary: 'Public summary',
      visibility: 'team',
      status: 'published',
      team: 'team123',
      created: '2026-10-17 00:00:00.000Z',
      expand: { team: { code: 'software' } },
    },
    { id: 'content123', body: 'private body', file: 'guide.pdf', size: 12 },
  )
  assert.equal(resource.team, 'software')
  assert.equal(resource.body, 'private body')
  assert.equal(resource.content_id, 'content123')
  assert.equal(resource.file, 'guide.pdf')
})

test('PocketBase API and protected file URLs are deterministic', () => {
  assert.equal(apiBaseUrl('http://127.0.0.1:18082'), 'http://127.0.0.1:18082/api')
  assert.equal(apiBaseUrl('/pb/api/'), '/pb/api')
  assert.equal(
    protectedFileUrl('/pb/api', 'resource_contents', 'content123', 'guide final.pdf', 'short token'),
    '/pb/api/files/resource_contents/content123/guide%20final.pdf?token=short%20token',
  )
})

test('PocketBase announcement writes send only API contract fields', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  const response = body => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    async json() { return body },
    async text() { return JSON.stringify(body) },
  })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    const data = JSON.parse(options.body)
    return response({ data: { id: 'announcement123', ...data } })
  }
  try {
    const api = await import(`../src/api/pocketbase.js?announcements=${Date.now()}`)
    const input = {
      id: 'stale-form-id',
      slug: 'lab-update',
      title: 'Lab update',
      summary: 'A short update',
      body: 'Details',
      kind: 'news',
      status: 'published',
      pinned: true,
      sort_order: 3,
      created_at: '2026-10-17T00:00:00.000Z',
    }
    const expectedBody = {
      slug: 'lab-update',
      title: 'Lab update',
      summary: 'A short update',
      body: 'Details',
      kind: 'news',
      status: 'published',
      pinned: true,
      sort_order: 3,
    }

    const created = await api.createAnnouncement(input)
    const updated = await api.updateAnnouncement('announcement123', input)
    const partialUpdate = await api.updateAnnouncement('announcement123', {
      id: 'forged-id',
      title: 'Retitled',
      pinned: false,
      sort_order: 0,
      published_at: '2026-10-17T00:00:00.000Z',
    })

    assert.equal(created.data.id, 'announcement123')
    assert.equal(updated.data.id, 'announcement123')
    assert.equal(partialUpdate.data.pinned, false)
    assert.equal(partialUpdate.data.sort_order, 0)
    assert.equal(calls.length, 3)
    assert.equal(calls[0].options.method, 'POST')
    assert.equal(calls[1].options.method, 'PATCH')
    assert.equal(calls[2].options.method, 'PATCH')
    assert.equal(calls[0].url, '/api/lab/admin/announcements')
    assert.equal(calls[1].url, '/api/lab/admin/announcements/announcement123')
    assert.equal(calls[2].url, '/api/lab/admin/announcements/announcement123')
    assert.deepEqual(JSON.parse(calls[0].options.body), expectedBody)
    assert.deepEqual(JSON.parse(calls[1].options.body), expectedBody)
    assert.deepEqual(JSON.parse(calls[2].options.body), { title: 'Retitled', pinned: false, sort_order: 0 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('project contract preserves structured showcase and media fields', () => {
  const project = normalizeProject({
    id: 'project123', legacy_id: 'hw1', edition: 'xiaoxueqi-2026', slug: 'xiaoxueqi-2026-hw1',
    group_label: '硬件一组', category: 'hardware', category_label: '硬件实物', title: '小车', subtitle: '控制', summary: '摘要',
    tags: ['STM32'], highlights: ['循迹'], outcomes: ['演示'], tech: ['PWM'], members_text: '成员',
    media: ['assets/car.png'], videos: [{ label: '视频', path: '../missing/demo.mp4' }], files: [], accent: 'cyan', sort_order: 0, status: 'published',
  })
  assert.equal(project.group, '硬件一组')
  assert.equal(project.categoryLabel, '硬件实物')
  assert.equal(project.media[0], 'assets/car.png')
  assert.equal(project.videos[0].path, '../missing/demo.mp4')
  assert.deepEqual(projectPayload(project).group, '硬件一组')
})

test('PocketBase adapter keeps auth state and addresses protected files by content record', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  const calls = []
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  const response = (body, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    async json() { return body },
    async text() { return JSON.stringify(body) },
  })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/auth-with-password')) {
      return response({ token: 'token-1', record: { id: 'user123', primary_team: 'team123', is_active: true, status: 'approved', role: 'member' } })
    }
    if (url.includes('/collections/users/records/user123')) {
      return response({ id: 'user123', primary_team: 'team123', is_active: true, status: 'approved', role: 'member', expand: { primary_team: { code: 'software' } } })
    }
    if (url.includes('/lab/resources/resource123')) {
      return response({
        resource: { id: 'resource123', team: 'team123', team_code: 'software', title: 'Guide', status: 'published', visibility: 'team' },
        content: { id: 'content123', resource: 'resource123', file: 'guide.pdf', body: 'body' },
        team_code: 'software',
      })
    }
    if (url.endsWith('/files/token')) {
      assert.equal(options.method, 'POST')
      return response({ token: 'short-lived' })
    }
    return response({ items: [] })
  }
  try {
    const api = await import(`../src/api/pocketbase.js?contract=${Date.now()}`)
    const login = await api.login({ account: '25010720732', password: 'password' })
    assert.equal(login.data.team, 'software')
    const fileUrl = await api.getProtectedResourceFileUrl('resource123')
    assert.equal(fileUrl, '/api/files/resource_contents/content123/guide.pdf?token=short-lived')
    assert.ok(calls.some(call => call.options.headers?.Authorization === 'Bearer token-1'))
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase adapter serves public resource files without an auth token', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  globalThis.fetch = async url => {
    if (url.includes('/lab/resources/public-resource')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async json() { return { resource: { id: 'public-resource', team: 'team123', team_code: 'software', title: 'Public guide', status: 'published', visibility: 'public' }, content: { id: 'public-content', resource: 'public-resource', file: 'guide.pdf' }, team_code: 'software' } },
        async text() { return '' },
      }
    }
    throw new Error(`unexpected PocketBase call: ${url}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?public-file=${Date.now()}`)
    const fileUrl = await api.getProtectedResourceFileUrl('public-resource')
    assert.equal(fileUrl, '/api/files/resource_contents/public-content/guide.pdf')
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase adapter clears stored auth after a disabled or invalid token', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map([['car_lab_pocketbase_auth_v1', JSON.stringify({ token: 'stale-token', record: { id: 'stale-user' } })]])
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  globalThis.fetch = async url => {
    if (url.includes('/collections/users/auth-refresh')) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        async json() { return { message: 'Not found' } },
        async text() { return JSON.stringify({ message: 'Not found' }) },
      }
    }
    if (url.includes('/collections/users/records/stale-user')) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        async json() { return { message: 'Not found' } },
        async text() { return JSON.stringify({ message: 'Not found' }) },
      }
    }
    throw new Error(`unexpected PocketBase call: ${url}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?stale-auth=${Date.now()}`)
    const result = await api.getMe()
    assert.deepEqual(result, { data: null })
    assert.equal(storage.has('car_lab_pocketbase_auth_v1'), false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase adapter refreshes auth before loading the current user', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map([['car_lab_pocketbase_auth_v1', JSON.stringify({ token: 'old-token', record: { id: 'user123' } })]])
  const calls = []
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  const response = (body, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    async json() { return body },
    async text() { return JSON.stringify(body) },
  })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/collections/users/auth-refresh')) {
      assert.equal(options.method, 'POST')
      assert.equal(options.headers.Authorization, 'Bearer old-token')
      return response({ token: 'new-token', record: { id: 'user123', primary_team: 'team123', is_active: true, status: 'approved', role: 'member' } })
    }
    if (url.includes('/collections/users/records/user123')) {
      return response({ id: 'user123', primary_team: 'team123', is_active: true, status: 'approved', role: 'member', expand: { primary_team: { code: 'software' } } })
    }
    throw new Error(`unexpected PocketBase call: ${url}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?refresh-auth=${Date.now()}`)
    const result = await api.getMe()
    assert.equal(result.data.team, 'software')
    assert.equal(JSON.parse(storage.get('car_lab_pocketbase_auth_v1')).token, 'new-token')
    assert.equal(calls[0].url.endsWith('/collections/users/auth-refresh'), true)
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase administrator writes use audited lab routes', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  const calls = []
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  const response = (body, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    async json() { return body },
    async text() { return JSON.stringify(body) },
  })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/collections/teams/records?')) return response({ items: [{ id: 'team123', code: 'software', name: '软件团队' }] })
    if (url.endsWith('/lab/resources')) return response({ resource: { id: 'resource123', team: 'team123', title: 'Guide', summary: 'Summary', visibility: 'public', status: 'published' }, content: { id: 'content123', resource: 'resource123', body: 'Body' } }, 201)
    throw new Error(`unexpected PocketBase call: ${url}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?admin-contract=${Date.now()}`)
    const result = await api.publishResource({ team: 'software', title: 'Guide', summary: 'Summary', body: 'Body', visibility: 'public' })
    assert.equal(result.data.id, 'resource123')
    assert.equal(result.data.content_id, 'content123')
    assert.equal(calls.filter(call => call.url.endsWith('/lab/resources')).length, 1)
    assert.equal(calls.some(call => call.url.includes('/collections/resources/records') && call.options.method === 'POST'), false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase adapter reports authenticated upload progress', async () => {
  const originalXHR = globalThis.XMLHttpRequest
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map([['car_lab_pocketbase_auth_v1', JSON.stringify({ token: 'upload-token', record: { id: 'admin123' } })]])
  const progress = []
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  class FakeXHR {
    constructor() { this.upload = {}; this.headers = {}; this.status = 0; this.responseText = ''; xhrInstance = this }
    open(method, url) { this.method = method; this.url = url }
    setRequestHeader(name, value) { this.headers[name] = value }
    getResponseHeader(name) { return name.toLowerCase() === 'content-type' ? 'application/json' : '' }
    send(body) {
      this.body = body
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 })
      this.status = 200
      this.responseText = JSON.stringify({ id: 'asset123', kind: 'image', label: 'Uploaded', source_type: 'upload', availability: 'available', published: true, filename: 'hero.png' })
      this.onload?.()
    }
  }
  let xhrInstance
  globalThis.XMLHttpRequest = FakeXHR
  try {
    const api = await import(`../src/api/pocketbase.js?upload-progress=${Date.now()}`)
    const result = await api.uploadProjectAssetFile('asset123', new Blob(['png'], { type: 'image/png' }), value => progress.push(value))
    assert.equal(result.data.id, 'asset123')
    assert.deepEqual(progress, [50, 100])
    assert.equal(xhrInstance.headers.Authorization, 'Bearer upload-token')
    assert.equal(xhrInstance.body instanceof FormData, true)
  } finally {
    globalThis.XMLHttpRequest = originalXHR
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase project writes use audited project routes', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  const calls = []
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } })
  const response = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, async json() { return body }, async text() { return JSON.stringify(body) } })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/lab/projects')) return response({ id: 'project123', slug: 'runtime-project', group_label: '软件实践组', category: 'software', category_label: '软件系统', title: '项目', subtitle: '副标题', summary: '摘要', tags: [], highlights: [], outcomes: [], tech: [], members_text: '', media: [], videos: [], files: [], status: 'published' }, 201)
    if (url.endsWith('/lab/projects/project123')) return response({ id: 'project123', slug: 'runtime-project', group_label: '软件实践组', category: 'software', category_label: '软件系统', title: '项目已编辑', subtitle: '副标题', summary: '摘要', tags: [], highlights: [], outcomes: [], tech: [], members_text: '', media: [], videos: [], files: [], status: 'published' })
    if (url.endsWith('/lab/projects/project123/offline')) return response({ id: 'project123', status: 'offline' })
    throw new Error(`unexpected PocketBase call: ${url}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?project-contract=${Date.now()}`)
    const input = { slug: 'runtime-project', edition: 'custom', group: '软件实践组', category: 'software', categoryLabel: '软件系统', title: '项目', subtitle: '副标题', summary: '摘要', tags: [], highlights: [], outcomes: [], tech: [], members: '', media: [], videos: [], files: [], status: 'published' }
    assert.equal((await api.createProject(input)).data.id, 'project123')
    assert.equal((await api.updateProject('project123', { ...input, title: '项目已编辑' })).data.title, '项目已编辑')
    assert.equal((await api.offlineProject('project123')).data.status, 'offline')
    assert.equal(calls.some(call => call.url.endsWith('/collections/projects/records')), false)
    assert.equal(JSON.parse(calls[0].options.body).group_label, '软件实践组')
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase project asset adapter keeps media writes on audited routes', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  const calls = []
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
  })
  const response = (body, status = 200) => ({
    ok: status < 400,
    status,
    headers: { get: () => 'application/json' },
    async json() { return body },
    async text() { return JSON.stringify(body) },
  })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/collections/projects/records/project123')) {
      return response({ id: 'project123', slug: 'runtime-project', status: 'published' })
    }
    if (url.includes('/collections/project_assets/records?')) {
      return response({ items: [{ id: 'asset123', project_id: 'project123', kind: 'image', label: 'Hero', source_type: 'upload', availability: 'available', published: true, url: '/api/files/project_assets/asset123/hero.png' }] })
    }
    if (url.endsWith('/lab/projects/project123/assets')) {
      assert.equal(options.method, 'POST')
      assert.ok(options.body instanceof FormData)
      assert.equal(options.body.get('kind'), 'image')
      return response({ id: 'asset123', project_id: 'project123', kind: 'image', label: 'Hero', source_type: 'upload', availability: 'available', published: false }, 201)
    }
    if (url.endsWith('/lab/project-assets/asset123')) {
      assert.equal(options.method, 'PATCH')
      const payload = JSON.parse(options.body)
      assert.equal(payload.label, 'Hero updated')
      return response({ id: 'asset123', project_id: 'project123', kind: 'image', label: 'Hero updated', source_type: 'upload', availability: 'available', published: true })
    }
    if (url.endsWith('/lab/project-assets/asset123/file')) {
      assert.equal(options.method, 'POST')
      assert.ok(options.body instanceof FormData)
      return response({ id: 'asset123', project_id: 'project123', kind: 'image', label: 'Hero updated', source_type: 'upload', availability: 'available', published: false })
    }
    if (url.endsWith('/lab/project-assets/asset123/offline')) {
      assert.equal(options.method, 'POST')
      return response({ id: 'asset123', project_id: 'project123', kind: 'image', label: 'Hero updated', source_type: 'upload', availability: 'offline', published: false })
    }
    throw new Error(`unexpected PocketBase call: ${url}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?asset-contract=${Date.now()}`)
    const listed = await api.listProjectAssets('project123')
    assert.equal(listed.data[0].url, '/api/files/project_assets/asset123/hero.png')
    const file = new Blob(['png'], { type: 'image/png' })
    const created = await api.createProjectAsset('project123', { kind: 'image', label: 'Hero', source_type: 'upload', availability: 'available', file })
    assert.equal(created.data.id, 'asset123')
    assert.equal((await api.updateProjectAsset('asset123', { kind: 'image', label: 'Hero updated', source_type: 'upload', availability: 'available', published: true })).data.published, true)
    assert.equal((await api.uploadProjectAssetFile('asset123', file)).data.published, false)
    assert.equal((await api.offlineProjectAsset('asset123')).data.availability, 'offline')
    assert.equal(calls.some(call => call.url.includes('/collections/project_assets/records') && call.options.method && call.options.method !== 'GET'), false)
    assert.equal(calls.some(call => call.url.endsWith('/lab/projects/project123/assets')), true)
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})

test('PocketBase adapter follows all pages for administrative member lists', async () => {
  const originalFetch = globalThis.fetch
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const calls = []
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })
  const response = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, async json() { return body }, async text() { return JSON.stringify(body) } })
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options })
    const page = new URL(url, 'http://pocketbase.local').searchParams.get('page') || '1'
    if (page === '1') return response({ page: 1, perPage: 200, totalItems: 201, totalPages: 2, items: Array.from({ length: 200 }, (_, index) => ({ id: `member-${index + 1}`, student_id: `25${String(index + 1).padStart(9, '0')}`, name: `成员${index + 1}`, role: 'member', is_active: true, expand: index === 0 ? { memberships: [{ id: 'membership-1', team: 'team456', status: 'approved', is_active: true, expand: { team: { code: 'hardware' } } }] } : undefined })) })
    if (page === '2') return response({ page: 2, perPage: 200, totalItems: 201, totalPages: 2, items: [{ id: 'member-201', student_id: '25000000201', name: '第201位', role: 'member', is_active: true }] })
    throw new Error(`unexpected page ${page}`)
  }
  try {
    const api = await import(`../src/api/pocketbase.js?pagination-contract=${Date.now()}`)
    const result = await api.listMembers()
    assert.equal(result.data.length, 201)
    assert.equal(result.data.at(-1).id, 'member-201')
    assert.equal(result.data[0].memberships[0].team, 'hardware')
    assert.equal(calls.length, 2)
    assert.equal(new URL(calls[0].url, 'http://pocketbase.local').searchParams.get('page'), '1')
    assert.equal(new URL(calls[1].url, 'http://pocketbase.local').searchParams.get('page'), '2')
    assert.equal(new URL(calls[0].url, 'http://pocketbase.local').searchParams.get('sort'), '-created')
    assert.equal(new URL(calls[1].url, 'http://pocketbase.local').searchParams.get('expand'), 'primary_team,memberships,memberships.team')
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor)
    else delete globalThis.localStorage
  }
})
