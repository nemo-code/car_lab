const asBoolean = value => value === true || value === 1 || value === '1'

export function teamCode(record, field = 'team') {
  if (!record || typeof record !== 'object') return ''
  const expanded = record.expand?.[field]
  if (expanded && typeof expanded === 'object') return expanded.code || expanded.id || ''
  return record[`${field}_code`] || record[field] || ''
}

export function normalizeUser(record) {
  if (!record) return null
  const studentId = record.student_id || record.studentId || ''
  const active = asBoolean(record.is_active ?? record.isActive)
  const team = teamCode(record, 'primary_team') || record.team || ''
  const expandedMemberships = Array.isArray(record.expand?.memberships) ? record.expand.memberships : []
  const memberships = expandedMemberships.map(item => ({
    id: item.id,
    user_id: item.user || record.id,
    team: teamCode(item) || item.team || item.team_code || '',
    status: item.status || 'pending',
    role: item.role || 'member',
    is_active: asBoolean(item.is_active),
    joined_at: item.joined_at || null,
    reviewed_at: item.reviewed_at || null,
  }))
  return {
    id: record.id,
    email: record.email || '',
    studentId,
    student_id: studentId,
    username: record.username || '',
    name: record.name || '',
    grade: record.grade || '',
    team,
    primary_team: record.primary_team || team,
    status: record.status || 'pending',
    role: record.role || 'member',
    isActive: active,
    is_active: active,
    memberships,
  }
}

export function normalizeApplication(record) {
  if (!record) return null
  const user = record.expand?.user || record.userRecord || record.user_data || {}
  const team = teamCode(record, 'team') || teamCode(user, 'primary_team')
  return {
    id: record.id,
    statement: record.statement || '',
    status: record.status || 'pending',
    created_at: record.created || record.created_at || '',
    reviewed_at: record.reviewed_at || '',
    review_note: record.review_note || '',
    reviewed_by: record.reviewed_by || '',
    name: user.name || record.name || '',
    email: user.email || record.email || '',
    student_id: user.student_id || user.studentId || record.student_id || '',
    username: user.username || record.username || '',
    grade: user.grade || record.grade || '',
    team,
    team_id: record.team || '',
    user_id: record.user || user.id || '',
  }
}

export function normalizeResource(record, content = null) {
  if (!record) return null
  const body = content?.body ?? record.body ?? ''
  const file = content?.file || record.file || ''
  return {
    id: record.id,
    team: teamCode(record) || record.team || '',
    title: record.title || '',
    summary: record.summary || '',
    visibility: record.visibility || 'public',
    status: record.status || 'published',
    body,
    file,
    filename: content?.filename || record.filename || '',
    size: content?.size ?? record.size ?? 0,
    created_at: record.created || record.created_at || '',
    updated_at: record.updated || record.updated_at || '',
    content_id: content?.id || '',
  }
}

export function normalizeListResponse(response) {
  if (!response) return []
  if (Array.isArray(response)) return response
  return Array.isArray(response.items) ? response.items : []
}

export function apiBaseUrl(raw = '/') {
  const base = String(raw || '/').replace(/\/+$/, '')
  return base.endsWith('/api') ? base : `${base}/api`
}

export function protectedFileUrl(apiBase, collection, recordId, filename, token = '') {
  const base = String(apiBase || '').replace(/\/+$/, '')
  const path = `/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}`
  return `${base}${path}${token ? `?token=${encodeURIComponent(token)}` : ''}`
}
