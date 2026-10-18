import { request } from './client'
const post = (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) })
export const getMe = () => request('/me')
export const apply = data => post('/apply', data)
export const login = data => post('/login', data)
export const logout = () => post('/logout', {})
export const changePassword = data => post('/password', data)
export const listResources = () => request('/resources')
export const readResource = id => request(`/resources/${encodeURIComponent(id)}`)
export const publishResource = data => post('/resources', data)
export const listApplications = () => request('/admin/applications')
export const reviewApplication = (id, status) => post(`/admin/applications/${encodeURIComponent(id)}/review`, { status })

export const listAssignments = () => request('/assignments')
export const createAssignment = data => post('/assignments', data)
export const listSubmissions = () => request('/submissions')
export const submitAssignment = (id, data) => post(`/assignments/${encodeURIComponent(id)}/submissions`, data)
export const uploadFile = (file, purpose) => request(`/uploads?purpose=${encodeURIComponent(purpose)}&name=${encodeURIComponent(file.name)}`, {
  method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file,
})

export const discardFile = id => request(`/uploads/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' })
