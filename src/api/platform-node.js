import { request, upload } from './client.js'
import { normalizeProject, projectPayload } from './project-contract.js'

const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) })

export const getMe = () => request('/me')
export const apply = data => post('/apply', data)
export const login = data => post('/login', data)
export const logout = () => post('/logout', {})
export const changePassword = data => post('/password', data)
export const applyTeam = data => post('/apply-team', data)
export const listResources = () => request('/resources')
export const listAdminResources = () => request('/admin/resources')
export const readResource = id => request(`/resources/${encodeURIComponent(id)}`)
const resourcePayload = data => ({
  team: data.team,
  title: data.title,
  summary: data.summary,
  visibility: data.visibility,
  body: data.body,
  status: data.status,
})
export async function publishResource(data, onProgress, onCreated) {
  const hasFile = typeof File !== 'undefined' && data.file instanceof File
  const result = await post('/resources', resourcePayload({ ...data, status: hasFile ? 'draft' : data.status }))
  onCreated?.(result.data.id)
  if (hasFile) {
    try {
      await uploadResourceFile(result.data.id, data.file, onProgress)
      if (data.status !== 'draft') await setResourceStatus(result.data.id, data.status)
    } catch (error) {
      error.resourceId = result.data.id
      throw error
    }
  }
  return result
}
export async function updateResource(id, data, onProgress) {
  const result = await request(`/resources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(resourcePayload(data)),
  })
  if (data.file instanceof File) await uploadResourceFile(id, data.file, onProgress)
  return result
}
export const deleteResource = id => request(`/resources/${encodeURIComponent(id)}`, {
  method: 'DELETE',
  body: JSON.stringify({}),
})
export const setResourceStatus = (id, status) => request(`/resources/${encodeURIComponent(id)}/status`, {
  method: 'PATCH',
  body: JSON.stringify({ status }),
})
export async function uploadResourceFile(id, file, onProgress) {
  const form = new FormData()
  form.append('file', file, file.name || 'resource-upload')
  return upload(`/resources/${encodeURIComponent(id)}/file`, form, { onProgress })
}
export const removeResourceFile = id => request(`/resources/${encodeURIComponent(id)}/file`, { method: 'DELETE' })
export const listApplications = () => request('/admin/applications')
export const reviewApplication = (id, status) => post(`/admin/applications/${encodeURIComponent(id)}/review`, { status })
export const listMembers = () => request('/admin/members')
export const listMemberships = () => request('/admin/memberships')
export const revokeMembership = id => post(`/admin/memberships/${encodeURIComponent(id)}/revoke`, {})
export const restoreMembership = id => post(`/admin/memberships/${encodeURIComponent(id)}/restore`, {})
export const listAuditLogs = () => request('/admin/audit')
export const getAdminSite = () => request('/admin/site')
export const updateSiteSection = (section, value) => request('/admin/site', { method: 'PATCH', body: JSON.stringify({ section, value }) })
export const getSiteContent = () => request('/site')
export const listTeams = () => request('/teams')
export const listAdminTeams = () => request('/admin/teams')
export const updateTeam = (id, data) => request(`/admin/teams/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) })
export const setMemberActive = (id, isActive) => post(`/admin/members/${encodeURIComponent(id)}/status`, { isActive })
export const resetMemberPassword = (id, password) => post(`/admin/members/${encodeURIComponent(id)}/reset-password`, { password })
export const listAnnouncements = () => request('/announcements')
export const readAnnouncement = ref => request(`/announcements/${encodeURIComponent(ref)}`)
export const listAdminAnnouncements = () => request('/admin/announcements')
export const createAnnouncement = data => request('/admin/announcements', { method: 'POST', body: JSON.stringify(data) })
export const updateAnnouncement = (id, data) => request(`/admin/announcements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) })
export const offlineAnnouncement = id => post(`/admin/announcements/${encodeURIComponent(id)}/offline`, {})

export async function getProtectedResourceFileUrl(resourceOrId) {
  const resource = typeof resourceOrId === 'object' && resourceOrId
    ? resourceOrId
    : (await readResource(resourceOrId)).data
  if (!resource?.file) return null
  return `${import.meta.env.VITE_API_BASE || '/api'}/resources/${encodeURIComponent(resource.id)}/file`
}

export async function listProjects() {
  const result = await request('/projects')
  return { data: (result.data || []).map(normalizeProject) }
}

export async function listAdminProjects() {
  const result = await request('/admin/projects')
  return { data: (result.data || []).map(normalizeProject) }
}

export async function createProject(data) {
  const result = await request('/admin/projects', { method: 'POST', body: JSON.stringify(projectPayload(data)) })
  return { data: normalizeProject(result.data) }
}

export async function updateProject(id, data) {
  const result = await request(`/admin/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(projectPayload(data)) })
  return { data: normalizeProject(result.data) }
}

export async function offlineProject(id) {
  const result = await request(`/admin/projects/${encodeURIComponent(id)}/offline`, { method: 'POST', body: JSON.stringify({}) })
  return { data: normalizeProject(result.data) }
}

function projectAssetPayload(data = {}) {
  return {
    kind: data.kind || 'image',
    label: String(data.label || '').trim(),
    source_type: data.source_type || data.source || 'legacy',
    availability: data.availability || 'missing',
    legacy_path: String(data.legacy_path || data.legacyPath || '').trim(),
    sort_order: Number(data.sort_order || data.sortOrder || 0),
    published: data.published === true || data.published === 1 || data.published === 'true' || data.published === '1',
  }
}

export async function listProjectAssets(projectRef) {
  const result = await request(`/projects/${encodeURIComponent(projectRef)}/assets`)
  return { data: result.data || [] }
}

export async function listAdminProjectAssets(projectRef) {
  const result = await request(`/admin/projects/${encodeURIComponent(projectRef)}/assets`)
  return { data: result.data || [] }
}

export async function createProjectAsset(projectRef, data = {}, onProgress) {
  if (typeof Blob !== 'undefined' && data.file instanceof Blob) {
    const form = new FormData()
    const fields = projectAssetPayload(data)
    Object.entries(fields).forEach(([key, value]) => form.set(key, String(value)))
    form.append('file', data.file, data.file.name || fields.label || 'project-asset')
    const result = await upload(`/admin/projects/${encodeURIComponent(projectRef)}/assets`, form, { onProgress })
    return { data: result.data }
  }
  const result = await request(`/admin/projects/${encodeURIComponent(projectRef)}/assets`, { method: 'POST', body: JSON.stringify(projectAssetPayload(data)) })
  return { data: result.data }
}

export async function updateProjectAsset(id, data = {}) {
  const result = await request(`/admin/project-assets/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(projectAssetPayload(data)) })
  return { data: result.data }
}

export async function uploadProjectAssetFile(id, file, onProgress) {
  if (typeof Blob === 'undefined' || !(file instanceof Blob)) throw new Error('Project asset file is required')
  const form = new FormData()
  form.append('file', file, file.name || 'project-asset')
  const result = await upload(`/admin/project-assets/${encodeURIComponent(id)}/file`, form, { onProgress })
  return { data: result.data }
}

export async function offlineProjectAsset(id) {
  const result = await request(`/admin/project-assets/${encodeURIComponent(id)}/offline`, { method: 'POST', body: JSON.stringify({}) })
  return { data: result.data }
}
