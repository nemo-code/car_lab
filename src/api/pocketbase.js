import {
  apiBaseUrl,
  normalizeApplication,
  normalizeListResponse,
  normalizeResource,
  normalizeUser,
  protectedFileUrl,
  teamCode,
} from './pocketbase-contract.js'
import { normalizeProject, projectPayload } from './project-contract.js'
import { defaultTeams } from '../lab.js'

const env = import.meta.env || {}
const API_BASE = apiBaseUrl(env.VITE_POCKETBASE_URL || '/')
const AUTH_STORAGE_KEY = 'car_lab_pocketbase_auth_v1'

let authState = loadStoredAuth()

function loadStoredAuth() {
  try {
    const raw = globalThis.localStorage?.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveStoredAuth(next) {
  authState = next
  try {
    if (next) globalThis.localStorage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
    else globalThis.localStorage?.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // Storage can be disabled in private browsing; the in-memory token still works.
  }
}

function authToken() {
  return typeof authState?.token === 'string' ? authState.token : ''
}

function authRecord() {
  return authState?.record || null
}

function clearAuth() {
  saveStoredAuth(null)
}

async function refreshAuth() {
  const token = authToken()
  if (!token) return null
  const response = await fetch(requestPath('/collections/users/auth-refresh'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const payload = await parseResponse(response)
  if (!response.ok) {
    if (response.status === 401) clearAuth()
    const message = payload && typeof payload === 'object'
      ? payload.message || payload.error || 'PocketBase auth refresh failed'
      : 'PocketBase auth refresh failed'
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }
  if (!payload?.token || !payload?.record) throw new Error('PocketBase did not return a refreshed auth record')
  saveStoredAuth({ token: payload.token, record: payload.record })
  return payload
}

function requestPath(path) {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  const text = await response.text()
  return text ? { message: text } : null
}

export async function request(path, options = {}) {
  const body = options.body
  const headers = {
    Accept: 'application/json',
    ...(body !== undefined && !(typeof FormData !== 'undefined' && body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}),
    ...(options.headers || {}),
  }
  const response = await fetch(requestPath(path), {
    ...options,
    headers,
  })
  const payload = await parseResponse(response)
  if (!response.ok) {
    if (response.status === 401) clearAuth()
    const message = payload && typeof payload === 'object'
      ? payload.message || payload.error || 'PocketBase request failed'
      : 'PocketBase request failed'
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

function uploadRequest(path, body, onProgress) {
  if (typeof XMLHttpRequest === 'undefined') return request(path, { method: 'POST', body })
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', requestPath(path))
    xhr.setRequestHeader('Accept', 'application/json')
    if (authToken()) xhr.setRequestHeader('Authorization', `Bearer ${authToken()}`)
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onerror = () => reject(new Error('上传失败，请检查网络后重试'))
    xhr.onabort = () => reject(new Error('上传已取消'))
    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') || ''
      let payload
      try {
        payload = contentType.includes('application/json') ? JSON.parse(xhr.responseText) : xhr.responseText
      } catch {
        payload = null
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401) clearAuth()
        const message = payload && typeof payload === 'object' ? payload.message || '上传失败' : '上传失败'
        const error = new Error(message)
        error.status = xhr.status
        error.payload = payload
        reject(error)
        return
      }
      if (typeof onProgress === 'function') onProgress(100)
      resolve(payload)
    }
    xhr.send(body)
  })
}

function jsonRequest(path, method, data) {
  return request(path, { method, body: JSON.stringify(data) })
}

function encodeId(id) {
  return encodeURIComponent(String(id))
}

function quoteFilter(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function normalizeTeam(record = {}) {
  let extra = {}
  if (typeof record.description === 'string') {
    try {
      const parsed = JSON.parse(record.description)
      if (parsed && typeof parsed === 'object') extra = parsed
    } catch {
      // Older PocketBase records may use description as plain text.
    }
  } else if (record.description && typeof record.description === 'object') {
    extra = record.description
  }
  const fallback = defaultTeams.find(team => team.id === (record.code || record.id)) || {}
  return {
    id: record.code || record.id,
    code: record.code || record.id,
    name: record.name || extra.name || record.code || record.id,
    caption: extra.caption || fallback.caption || record.name || '',
    image: extra.image || record.image || fallback.image || '',
    intro: extra.intro || extra.description || fallback.intro || '',
    learn: Array.isArray(extra.learn) && extra.learn.length ? extra.learn : (fallback.learn || []),
    practice: extra.practice || fallback.practice || '',
    sort_order: Number(record.sort || 0),
    enabled: record.enabled !== false,
  }
}

async function listRecords(collection, params = {}) {
  const loadAllPages = params.page === undefined && params.perPage === undefined
  const pageParams = { perPage: '200', ...params }
  const items = []
  let page = Number(pageParams.page || 1)
  while (true) {
    const query = new URLSearchParams({ ...pageParams, ...(loadAllPages ? { page: String(page) } : {}) })
    const response = await request(`/collections/${encodeId(collection)}/records?${query.toString()}`)
    const pageItems = normalizeListResponse(response)
    items.push(...pageItems)
    const totalPages = Number(response?.totalPages)
    if (!loadAllPages || !Number.isFinite(totalPages) || page >= totalPages || pageItems.length === 0) break
    page += 1
  }
  return items
}

async function getRecord(collection, id, expand = '') {
  const suffix = expand ? `?expand=${encodeURIComponent(expand)}` : ''
  return request(`/collections/${encodeId(collection)}/records/${encodeId(id)}${suffix}`)
}

async function createRecord(collection, data) {
  return request(`/collections/${encodeId(collection)}/records`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

async function updateRecord(collection, id, data) {
  return jsonRequest(`/collections/${encodeId(collection)}/records/${encodeId(id)}`, 'PATCH', data)
}

function isBlob(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function contentBody(resourceId, data = {}) {
  const file = data.file
  const fields = {
    resource: resourceId,
    body: String(data.body || ''),
    filename: data.filename || (isBlob(file) ? file.name || '' : ''),
    size: Number(data.size || (isBlob(file) ? file.size : 0) || 0),
  }
  if (!isBlob(file)) return JSON.stringify(fields)
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value))
  form.append('file', file, fields.filename || 'resource-upload')
  return form
}

async function saveContent(resourceId, data, existingId = '', onProgress) {
  if (isBlob(data.file)) {
    const form = new FormData()
    form.set('resource', resourceId)
    form.set('body', String(data.body || ''))
    form.set('filename', data.filename || data.file.name || '')
    form.set('size', String(data.size || data.file.size || 0))
    form.append('file', data.file, data.filename || data.file.name || 'resource-upload')
    return uploadRequest(`/lab/resources/${encodeId(resourceId)}/file`, form, onProgress)
  }
  const path = existingId ? `/collections/resource_contents/records/${encodeId(existingId)}` : '/collections/resource_contents/records'
  return request(path, {
    method: existingId ? 'PATCH' : 'POST',
    body: contentBody(resourceId, data),
  })
}

async function resolveTeamId(value) {
  const input = String(value || '').trim()
  if (!input) throw new Error('所属团队不能为空')
  const teams = await listRecords('teams', { filter: `code = ${quoteFilter(input)}` })
  const team = teams[0]
  if (!team && /^[a-z0-9]{15}$/i.test(input)) return input
  if (!team) throw new Error('所属团队不存在或已停用')
  return team.id
}

async function findContent(resourceId) {
  const records = await listRecords('resource_contents', {
    filter: `resource = ${quoteFilter(resourceId)}`,
    perPage: '1',
  })
  return records[0] || null
}

function applyPayload(data = {}) {
  return {
    name: String(data.name || '').trim(),
    student_id: String(data.studentId ?? data.student_id ?? '').trim(),
    username: String(data.username || '').trim().toLowerCase(),
    team: String(data.team || '').trim(),
    statement: String(data.statement || '').trim(),
    password: data.password,
  }
}

export async function getMe() {
  const record = authRecord()
  if (!authToken() || !record?.id) return { data: null }
  try {
    const refreshed = await refreshAuth()
    const fresh = await getRecord('users', refreshed?.record?.id || record.id, 'primary_team,memberships,memberships.team')
    saveStoredAuth({ token: refreshed?.token || authToken(), record: fresh })
    return { data: normalizeUser(fresh) }
  } catch (error) {
    // PocketBase returns 404 after a member is disabled or its token key is refreshed.
    if ([401, 403, 404].includes(error?.status)) {
      clearAuth()
      return { data: null }
    }
    throw error
  }
}

export async function apply(data) {
  const result = await jsonRequest('/lab/apply', 'POST', applyPayload(data))
  return { data: result }
}

export async function applyTeam(data = {}) {
  const result = await jsonRequest('/lab/apply-team', 'POST', { team: String(data.team || '').trim(), statement: String(data.statement || '').trim() })
  return { data: result }
}

export async function login(data = {}) {
  const result = await jsonRequest('/collections/users/auth-with-password', 'POST', {
    identity: String(data.account ?? data.identity ?? '').trim(),
    password: data.password,
  })
  if (!result?.token || !result?.record) throw new Error('PocketBase did not return an auth record')
  saveStoredAuth({ token: result.token, record: result.record })
  const fresh = await getRecord('users', result.record.id, 'primary_team,memberships,memberships.team').catch(() => result.record)
  saveStoredAuth({ token: result.token, record: fresh })
  return { data: normalizeUser(fresh), token: result.token }
}

export async function logout() {
  clearAuth()
  return { ok: true }
}

export async function changePassword(data = {}) {
  await jsonRequest('/lab/password', 'POST', {
    old_password: data.oldPassword ?? data.old_password,
    password: data.newPassword ?? data.password,
  })
  clearAuth()
  return { ok: true, reauthenticate: true }
}

export async function listResources() {
  const records = await listRecords('resources', { filter: 'status = "published" && visibility != "admin"', sort: '-created', expand: 'team' })
  return { data: records.map(record => normalizeResource(record)) }
}

export async function listAdminResources() {
  const adminResult = await request('/lab/admin/resources')
  const adminItems = Array.isArray(adminResult?.data) ? adminResult.data : []
  return { data: adminItems.map(record => normalizeResource(record)) }
}

export async function listTeams() {
  const records = await listRecords('teams', { filter: 'enabled = true', sort: 'sort' })
  return { data: records.map(normalizeTeam) }
}

export async function listAdminTeams() {
  const records = await listRecords('teams', { sort: 'sort' })
  return { data: records.map(normalizeTeam) }
}

export async function updateTeam(id, data = {}) {
  const records = await listRecords('teams', { filter: `(id = ${quoteFilter(id)} || code = ${quoteFilter(id)})`, perPage: '1' })
  const record = records[0]
  if (!record) throw new Error('Team not found')
  const previous = normalizeTeam(record)
  const value = {
    name: String(data.name ?? previous.name).trim(),
    sort: Number(data.sort_order ?? data.sortOrder ?? previous.sort_order),
    enabled: data.enabled === undefined ? previous.enabled : Boolean(data.enabled),
    description: JSON.stringify({
      caption: String(data.caption ?? previous.caption).trim(),
      image: String(data.image ?? previous.image).trim(),
      intro: String(data.intro ?? previous.intro).trim(),
      learn: Array.isArray(data.learn) ? data.learn.map(item => String(item || '').trim()).filter(Boolean) : previous.learn,
      practice: String(data.practice ?? previous.practice).trim(),
    }),
  }
  const result = await jsonRequest(`/lab/teams/${encodeId(record.id)}`, 'PATCH', {
    name: value.name,
    caption: JSON.parse(value.description).caption,
    image: JSON.parse(value.description).image,
    intro: JSON.parse(value.description).intro,
    learn: JSON.parse(value.description).learn,
    practice: JSON.parse(value.description).practice,
    sort_order: value.sort,
    enabled: value.enabled,
  })
  return { data: normalizeTeam(result) }
}

export async function readResource(id) {
  const result = await request(`/lab/resources/${encodeId(id)}`)
  const record = result.resource || result.data?.resource || result
  const content = result.content || result.data?.content || null
  return { data: normalizeResource({ ...record, team_code: result.team_code || record.team_code }, content) }
}

export async function publishResource(data = {}, onProgress, onCreated) {
  const hasFile = isBlob(data.file)
  const input = {
    team: await resolveTeamId(data.team),
    title: String(data.title || '').trim(),
    summary: String(data.summary || '').trim(),
    visibility: data.visibility || 'public',
    status: hasFile ? 'draft' : data.status || 'published',
  }
  const result = await jsonRequest('/lab/resources', 'POST', {
    ...input,
    body: String(data.body || ''),
    filename: data.filename || (isBlob(data.file) ? data.file.name || '' : ''),
    size: Number(data.size || (isBlob(data.file) ? data.file.size : 0) || 0),
  })
  onCreated?.(result.resource.id)
  let content = result.content
  if (hasFile) {
    try {
      content = await saveContent(result.resource.id, data, content?.id || '', onProgress)
      if (input.status !== (data.status || 'published')) {
        await jsonRequest(`/lab/resources/${encodeId(result.resource.id)}/status`, 'PATCH', { status: data.status })
      }
    } catch (error) {
      error.resourceId = result.resource.id
      throw error
    }
  }
  return { data: normalizeResource({ ...result.resource, team_code: result.team_code }, content) }
}

export async function updateResource(id, data = {}, onProgress) {
  const input = {
    team: await resolveTeamId(data.team),
    title: String(data.title || '').trim(),
    summary: String(data.summary || '').trim(),
    visibility: data.visibility || 'public',
    status: data.status || 'published',
    body: String(data.body || ''),
    filename: data.filename || (isBlob(data.file) ? data.file.name || '' : ''),
    size: Number(data.size || (isBlob(data.file) ? data.file.size : 0) || 0),
  }
  const result = await jsonRequest(`/lab/resources/${encodeId(id)}`, 'PATCH', input)
  let content = result.content
  if (isBlob(data.file)) content = await saveContent(id, data, content?.id || '', onProgress)
  const resource = result.resource
  return { data: normalizeResource({ ...resource, team_code: result.team_code }, content) }
}

export async function uploadResourceFile(id, file, onProgress) {
  if (!isBlob(file)) throw new Error('附件不能为空')
  const content = await findContent(id)
  return { data: await saveContent(id, { file }, content?.id || '', onProgress) }
}

export async function removeResourceFile(id) {
  const content = await findContent(id)
  if (content?.id) await request(`/lab/resources/${encodeId(id)}/file`, { method: 'DELETE' })
  return { ok: true }
}

export async function deleteResource(id) {
  return jsonRequest(`/lab/resources/${encodeId(id)}/offline`, 'POST', {})
}

export async function setResourceStatus(id, status) {
  const result = await jsonRequest(`/lab/resources/${encodeId(id)}/status`, 'PATCH', { status })
  return { data: normalizeResource(result.resource || result.data?.resource || result) }
}

export async function listApplications() {
  const records = await listRecords('applications', {
    sort: '-created',
    expand: 'user,team,reviewed_by',
  })
  return { data: records.map(normalizeApplication) }
}

export async function reviewApplication(id, status) {
  return jsonRequest(`/lab/applications/${encodeId(id)}/review`, 'POST', { status })
}

export async function listMembers() {
  const records = await listRecords('users', { sort: '-created', expand: 'primary_team,memberships,memberships.team' })
  return { data: records.map(normalizeUser) }
}

export async function listMemberships() {
  const result = await request('/lab/admin/memberships')
  return { data: result.data || [] }
}

export async function revokeMembership(id) {
  const result = await jsonRequest(`/lab/admin/memberships/${encodeId(id)}/revoke`, 'POST', {})
  return { data: result.data || result }
}

export async function restoreMembership(id) {
  const result = await jsonRequest(`/lab/admin/memberships/${encodeId(id)}/restore`, 'POST', {})
  return { data: result.data || result }
}

async function siteRecord(includeUnpublished = false) {
  const params = { filter: 'key = "site"', perPage: '1' }
  if (!includeUnpublished) params.filter = 'key = "site" && published = true'
  return (await listRecords('site_pages', params))[0] || null
}

export async function getSiteContent() {
  const record = await siteRecord(false)
  return { ok: true, data: record?.payload && typeof record.payload === 'object' ? record.payload : {} }
}

export async function getAdminSite() {
  const record = await siteRecord(true)
  return { data: record?.payload && typeof record.payload === 'object' ? record.payload : {} }
}

export async function updateSiteSection(section, value) {
  if (!section || !value || typeof value !== 'object') throw new Error('Invalid site content section')
  return jsonRequest('/lab/site', 'PATCH', { section, value })
}

export async function listAuditLogs() {
  const records = await listRecords('audit_logs', { sort: '-at', perPage: '200' })
  return { data: records.map(record => ({
    id: record.id,
    action: record.action || '',
    target_type: record.target_type || '',
    target_id: record.target_id || '',
    metadata: record.metadata && typeof record.metadata === 'object' ? record.metadata : {},
    created_at: record.at || record.created || '',
  })) }
}

function normalizeAnnouncement(record = {}) {
  return {
    id: record.id,
    slug: record.slug || '',
    title: record.title || '',
    summary: record.summary || '',
    body: record.body || '',
    kind: record.kind || 'notice',
    status: record.status || 'draft',
    pinned: record.pinned === true || record.pinned === 1,
    sort_order: Number(record.sort_order || 0),
    published_at: record.published_at || null,
    created_at: record.created || record.created_at || '',
    updated_at: record.updated || record.updated_at || '',
  }
}

function announcementPayload(data = {}) {
  const keys = ['slug', 'title', 'summary', 'body', 'kind', 'status', 'pinned', 'sort_order']
  return Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]))
}

export async function listAnnouncements() {
  const result = await request('/lab/announcements')
  return { data: (result.data || []).map(normalizeAnnouncement) }
}

export async function readAnnouncement(ref) {
  const result = await request(`/lab/announcements/${encodeId(ref)}`)
  return { data: normalizeAnnouncement(result.data || result) }
}

export async function listAdminAnnouncements() {
  const result = await request('/lab/admin/announcements')
  return { data: (result.data || []).map(normalizeAnnouncement) }
}

export async function createAnnouncement(data = {}) {
  const result = await jsonRequest('/lab/admin/announcements', 'POST', announcementPayload(data))
  return { data: normalizeAnnouncement(result.data || result) }
}

export async function updateAnnouncement(id, data = {}) {
  const result = await jsonRequest(`/lab/admin/announcements/${encodeId(id)}`, 'PATCH', announcementPayload(data))
  return { data: normalizeAnnouncement(result.data || result) }
}

export async function offlineAnnouncement(id) {
  const result = await jsonRequest(`/lab/admin/announcements/${encodeId(id)}/offline`, 'POST', {})
  return { data: normalizeAnnouncement(result.data || result) }
}

export async function setMemberActive(id, isActive) {
  return jsonRequest(`/lab/members/${encodeId(id)}/active`, 'POST', { is_active: Boolean(isActive) })
}

export async function resetMemberPassword(id, password) {
  return jsonRequest(`/lab/members/${encodeId(id)}/reset-password`, 'POST', { password })
}

export async function getProtectedResourceFileUrl(resourceOrId) {
  const resource = typeof resourceOrId === 'object' && resourceOrId
    ? resourceOrId
    : (await readResource(resourceOrId)).data
  const content = resource.content_id
    ? { id: resource.content_id, file: resource.file }
    : await findContent(resource.id)
  const filename = content?.file || resource.file
  if (!content?.id || !filename) return null
  if (resource.visibility === 'public') {
    return protectedFileUrl(API_BASE, 'resource_contents', content.id, filename)
  }
  const tokenResponse = await request('/files/token', { method: 'POST', body: '{}' })
  const token = tokenResponse?.token
  if (!token) throw new Error('PocketBase did not return a protected-file token')
  return protectedFileUrl(API_BASE, 'resource_contents', content.id, filename, token)
}

function pocketbaseProjectPayload(data = {}) {
  const input = projectPayload(data)
  return {
    legacy_id: input.legacy_id,
    edition: input.edition,
    slug: input.slug,
    group_label: input.group,
    category: input.category,
    category_label: input.categoryLabel,
    title: input.title,
    subtitle: input.subtitle,
    summary: input.summary,
    tags: input.tags,
    highlights: input.highlights,
    outcomes: input.outcomes,
    tech: input.tech,
    members_text: input.members,
    media: input.media,
    videos: input.videos,
    files: input.files,
    accent: input.accent,
    sort_order: input.sort_order,
    status: input.status,
  }
}

async function normalizeProjectsWithAssets(records, admin = false) {
  return Promise.all(records.map(async record => {
    const filter = admin
      ? `project = ${quoteFilter(record.id)}`
      : `project = ${quoteFilter(record.id)} && published = true && availability = "available"`
    const assets = await listRecords('project_assets', { filter, sort: 'sort_order,created' })
    return normalizeProject({ ...record, assets: assets.map(normalizeProjectAsset) })
  }))
}

export async function listProjects() {
  const records = await listRecords('projects', { filter: 'status = "published"', sort: 'edition,sort_order,created' })
  return { data: await normalizeProjectsWithAssets(records) }
}

export async function listAdminProjects() {
  const records = await listRecords('projects', { sort: 'edition,sort_order,created' })
  return { data: await normalizeProjectsWithAssets(records, true) }
}

export async function createProject(data) {
  const result = await jsonRequest('/lab/projects', 'POST', pocketbaseProjectPayload(data))
  return { data: normalizeProject(result) }
}

export async function updateProject(id, data) {
  const result = await jsonRequest(`/lab/projects/${encodeId(id)}`, 'PATCH', pocketbaseProjectPayload(data))
  return { data: normalizeProject(result) }
}

export async function offlineProject(id) {
  const result = await jsonRequest(`/lab/projects/${encodeId(id)}/offline`, 'POST', {})
  return { data: normalizeProject(result) }
}

function normalizeProjectAsset(record) {
  if (!record) return null
  const filename = record.filename || record.file || ''
  const sourceType = record.source_type || record.source || ''
  const legacyPath = record.legacy_path || ''
  const legacyUrl = sourceType === 'external' && /^https?:\/\//i.test(legacyPath)
    ? legacyPath
    : sourceType === 'legacy' && legacyPath && !legacyPath.startsWith('../')
      ? (legacyPath.startsWith('/') ? legacyPath : `/projects/xiaoxueqi-2026/showcase-site/${legacyPath}`)
      : ''
  const url = record.url || legacyUrl || (filename ? `${API_BASE}/files/project_assets/${encodeId(record.id)}/${encodeURIComponent(filename)}` : '')
  return {
    id: record.id,
    project_id: record.project_id || record.project || '',
    kind: record.kind || '',
    label: record.label || '',
    source_type: sourceType,
    availability: record.availability || '',
    legacy_path: record.legacy_path || '',
    filename,
    size: Number(record.size || 0),
    mime: record.mime || '',
    sort_order: Number(record.sort_order || 0),
    published: record.published === true || record.published === 1,
    url,
  }
}

export async function listProjectAssets(projectRef) {
  const project = await getRecord('projects', projectRef)
  const records = await listRecords('project_assets', { filter: `project = ${quoteFilter(project.id)} && published = true && availability = "available"`, sort: 'sort_order,created' })
  return { data: records.map(normalizeProjectAsset) }
}

export async function listAdminProjectAssets(projectRef) {
  const project = await getRecord('projects', projectRef)
  const records = await listRecords('project_assets', { filter: `project = ${quoteFilter(project.id)}`, sort: 'sort_order,created' })
  return { data: records.map(normalizeProjectAsset) }
}

export async function createProjectAsset(projectRef, data = {}, onProgress) {
  const form = new FormData()
  const fields = {
    kind: data.kind || 'image', label: data.label || '', source_type: data.source_type || data.source || 'legacy',
    availability: data.availability || 'missing', legacy_path: data.legacy_path || '', sort_order: Number(data.sort_order || 0),
    published: data.published === true || data.published === 1 ? 'true' : 'false',
  }
  Object.entries(fields).forEach(([key, value]) => form.set(key, String(value)))
  if (isBlob(data.file)) form.append('file', data.file, data.file.name || fields.label || 'project-asset')
  const result = await uploadRequest(`/lab/projects/${encodeId(projectRef)}/assets`, form, onProgress)
  return { data: normalizeProjectAsset(result) }
}

export async function updateProjectAsset(id, data = {}) {
  const result = await jsonRequest(`/lab/project-assets/${encodeId(id)}`, 'PATCH', {
    kind: data.kind, label: data.label, source_type: data.source_type || data.source, availability: data.availability,
    legacy_path: data.legacy_path || data.legacyPath, sort_order: Number(data.sort_order || 0), published: Boolean(data.published),
  })
  return { data: normalizeProjectAsset(result) }
}

export async function uploadProjectAssetFile(id, file, onProgress) {
  if (!isBlob(file)) throw new Error('Project asset file is required')
  const form = new FormData()
  form.append('file', file, file.name || 'project-asset')
  const result = await uploadRequest(`/lab/project-assets/${encodeId(id)}/file`, form, onProgress)
  return { data: normalizeProjectAsset(result) }
}

export async function offlineProjectAsset(id) {
  const result = await jsonRequest(`/lab/project-assets/${encodeId(id)}/offline`, 'POST', {})
  return { data: normalizeProjectAsset(result) }
}

export function isConfigured() {
  return Boolean(env.VITE_POCKETBASE_URL || env.VITE_PLATFORM_BACKEND === 'pocketbase')
}

export { API_BASE, teamCode }
