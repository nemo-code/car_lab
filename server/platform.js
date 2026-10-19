import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { catalog } from './catalog.js'
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto'
import { maxSitePayloadLength, siteSections, validateSitePayload, validateSitePayloadSize, validateSiteSection } from './site-content-contract.js'

export const teams = ['software', 'hardware', 'simulation']
const teamDefaults = [
  { id: 'software', name: '软件团队', caption: '让车辆数据变成可用体验', image: '/projects/xiaoxueqi-2026/photos/软件1.png', intro: '从车载应用、数据链路到机器视觉，把车辆状态与感知结果转化为清晰、可靠的交互体验。', learn: ['Android 与车载应用开发', 'CAN 数据读取与状态展示', '视觉感知与主动安全交互'], practice: '从界面、数据或算法中的一个小模块开始，逐步拼出完整的车载系统。' },
  { id: 'hardware', name: '硬件团队', caption: '让控制策略落到真实设备', image: '/projects/xiaoxueqi-2026/photos/硬件1.png', intro: '围绕单片机、传感器、电机和智能小车，完成从电路连接、底层驱动到整车联调的工程实践。', learn: ['单片机与外设接口', '传感器采集和电机驱动', '运动控制与整车调试'], practice: '把线路接通、让电机转起来，再通过持续测试让设备稳定完成任务。' },
  { id: 'simulation', name: '游戏 / 仿真团队', caption: '在交互场景中验证与表达', image: '/projects/xiaoxueqi-2026/photos/游戏1.png', intro: '用车辆仿真、游戏引擎和交互设计搭建可体验的驾驶场景，让控制与座舱想法变成可玩的作品。', learn: ['Unity 场景与交互开发', '车辆控制与驾驶仿真', '多人协作与体验设计'], practice: '从驾驶输入、画面反馈或多人联机中的一个体验细节开始，逐步搭建完整场景。' },
]
const dbPath = process.env.LAB_DB_PATH || path.resolve('data/lab.sqlite')
const resourceFilesRoot = path.resolve(path.dirname(dbPath), 'resource-files')
const projectFilesRoot = path.resolve(path.dirname(dbPath), 'project-files')
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, student_id TEXT UNIQUE, username TEXT COLLATE NOCASE UNIQUE, name TEXT NOT NULL, grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member', is_active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, caption TEXT NOT NULL, image TEXT NOT NULL, intro TEXT NOT NULL, learn TEXT NOT NULL, practice TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, team TEXT, statement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS team_memberships (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member', is_active INTEGER NOT NULL DEFAULT 1, joined_at TEXT, reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, team));
  CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'notice', status TEXT NOT NULL DEFAULT 'draft', pinned INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, published_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, team TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, visibility TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL, attachments TEXT NOT NULL DEFAULT '[]');
  CREATE TABLE IF NOT EXISTS resource_contents (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL UNIQUE, body TEXT NOT NULL, storage_key TEXT, filename TEXT, size INTEGER NOT NULL DEFAULT 0, mime TEXT, checksum TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, purpose TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, entity_id TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, team TEXT NOT NULL, due_at TEXT, author_id TEXT NOT NULL, created_at TEXT NOT NULL, target_grade TEXT NOT NULL DEFAULT 'all');
  CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL, attachments TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, legacy_id TEXT, edition TEXT NOT NULL DEFAULT 'custom', slug TEXT NOT NULL UNIQUE, project_group TEXT NOT NULL, category TEXT NOT NULL, category_label TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT NOT NULL, summary TEXT NOT NULL, tags TEXT NOT NULL, highlights TEXT NOT NULL, outcomes TEXT NOT NULL, tech TEXT NOT NULL, members TEXT NOT NULL, media TEXT NOT NULL, videos TEXT NOT NULL, files TEXT NOT NULL, accent TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT);
  CREATE TABLE IF NOT EXISTS project_assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'upload', availability TEXT NOT NULL DEFAULT 'available', legacy_path TEXT, storage_key TEXT, filename TEXT, size INTEGER NOT NULL DEFAULT 0, mime TEXT, checksum TEXT, sort_order INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id, kind, legacy_path));
  CREATE TABLE IF NOT EXISTS site_pages (key TEXT PRIMARY KEY, title TEXT NOT NULL, payload TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL);`)
// 旧库迁移：旧 users 表只有 (id, email, name, password_hash, team, status, role)，没有 student_id 列
let userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name)
if (!userColumns.includes('student_id')) {
  db.exec(`BEGIN;
    ALTER TABLE users RENAME TO users_old;
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, student_id TEXT UNIQUE, username TEXT COLLATE NOCASE UNIQUE, name TEXT NOT NULL, grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member', is_active INTEGER NOT NULL DEFAULT 1);
    INSERT INTO users (id, email, name, password_hash, team, status, role)
      SELECT id, email, name, password_hash, team, status, role FROM users_old;
    DROP TABLE users_old;
    COMMIT;`)
  userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name)
}
if (!userColumns.includes('is_active')) {
  db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username_nocase ON users(username COLLATE NOCASE)')
db.exec("UPDATE users SET role = 'student' WHERE role = 'member'")
const applicationColumns = db.prepare('PRAGMA table_info(applications)').all().map(column => column.name)
if (!applicationColumns.includes('team')) db.exec('ALTER TABLE applications ADD COLUMN team TEXT')
db.exec('CREATE INDEX IF NOT EXISTS applications_team_status ON applications(team, status)')
db.exec('CREATE INDEX IF NOT EXISTS team_memberships_user_status ON team_memberships(user_id, status, is_active)')
db.exec('CREATE INDEX IF NOT EXISTS team_memberships_team_status ON team_memberships(team, status, is_active)')
for (const user of db.prepare("SELECT id, team, status, role, is_active FROM users WHERE team IS NOT NULL AND team <> ''").all()) {
  const now = new Date().toISOString()
  const membershipStatus = user.role === 'admin' ? 'approved' : (['pending', 'approved', 'rejected'].includes(user.status) ? user.status : 'pending')
  db.prepare(`INSERT OR IGNORE INTO team_memberships
    (id, user_id, team, status, role, is_active, joined_at, reviewed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'member', ?, ?, ?, ?, ?)`)
    .run(randomUUID(), user.id, user.team, membershipStatus, user.is_active ? 1 : 0,
      membershipStatus === 'approved' ? now : null, membershipStatus === 'pending' ? null : now, now, now)
}
db.prepare(`UPDATE applications SET team = (SELECT u.team FROM users u WHERE u.id = applications.user_id) WHERE team IS NULL OR team = ''`).run()
const resourceColumns = db.prepare('PRAGMA table_info(resources)').all().map(column => column.name)
if (!resourceColumns.includes('status')) db.exec("ALTER TABLE resources ADD COLUMN status TEXT NOT NULL DEFAULT 'published'")
if (!resourceColumns.includes('attachments')) db.exec("ALTER TABLE resources ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
mkdirSync(resourceFilesRoot, { recursive: true })
mkdirSync(projectFilesRoot, { recursive: true })
db.exec(`INSERT OR IGNORE INTO resource_contents
  (id, resource_id, body, storage_key, filename, size, mime, checksum, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), id, body, NULL, '', 0, '', '', created_at, created_at
  FROM resources`)
const projectColumns = db.prepare('PRAGMA table_info(projects)').all().map(column => column.name)
if (!projectColumns.includes('legacy_id')) db.exec("ALTER TABLE projects ADD COLUMN legacy_id TEXT")
if (!projectColumns.includes('edition')) db.exec("ALTER TABLE projects ADD COLUMN edition TEXT NOT NULL DEFAULT 'custom'")
if (!projectColumns.includes('sort_order')) db.exec('ALTER TABLE projects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
const assignmentColumns = db.prepare('PRAGMA table_info(assignments)').all().map(c => c.name)
if (!assignmentColumns.includes('target_grade')) db.exec("ALTER TABLE assignments ADD COLUMN target_grade TEXT NOT NULL DEFAULT 'all'")
export const storageRoot = path.resolve(path.dirname(dbPath), 'uploads')
mkdirSync(storageRoot, { recursive: true })
const hashToken = token => createHash('sha256').update(token).digest('hex')
const safeMetadata = metadata => Object.fromEntries(Object.entries(metadata || {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)))
export const RESOURCE_FILE_MAX_BYTES = 30 * 1024 * 1024
export const RESOURCE_FILE_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain',
  'application/zip', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
export const PROJECT_ASSET_MAX_BYTES = 30 * 1024 * 1024
export const PROJECT_ASSET_MIME_TYPES = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  video: new Set(['video/mp4', 'video/webm', 'video/quicktime']),
  file: new Set([...RESOURCE_FILE_MIME_TYPES]),
}
const PROJECT_ASSET_EXTENSIONS = {
  image: new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']),
  video: new Set(['.mp4', '.webm', '.mov']),
  file: new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt', '.zip', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']),
}
const resourceFileExtension = filename => {
  const extension = path.extname(String(filename || '')).toLowerCase()
  return /^[.][a-z0-9]{1,10}$/.test(extension) ? extension : ''
}
function resourceContent(row) {
  if (!row) return null
  const content = db.prepare('SELECT id, body, storage_key, filename, size, mime, checksum, created_at, updated_at FROM resource_contents WHERE resource_id = ?').get(row.id)
  if (!content) return { ...row, status: row.status || 'published' }
  return {
    ...row,
    body: content.body,
    status: row.status || 'published',
    content_id: content.id,
    storage_key: content.storage_key || '',
    file: content.storage_key ? content.filename || content.id : '',
    filename: content.filename || '',
    size: content.size || 0,
    mime: content.mime || '',
    checksum: content.checksum || '',
  }
}
function resourceSummary(row) {
  if (!row) return null
  const content = db.prepare('SELECT id, storage_key, filename, size, mime, checksum, updated_at FROM resource_contents WHERE resource_id = ?').get(row.id)
  return {
    id: row.id,
    team: row.team,
    title: row.title,
    summary: row.summary,
    visibility: row.visibility,
    status: row.status || 'published',
    created_at: row.created_at,
    updated_at: content?.updated_at || row.created_at,
  }
}
function adminResourceSummary(row) {
  const result = resourceSummary(row)
  if (!result) return result
  const content = db.prepare('SELECT id, storage_key, filename, size, mime, checksum FROM resource_contents WHERE resource_id = ?').get(row.id)
  return {
    ...result,
    content_id: content?.id || '',
    file: content?.storage_key ? content.filename || content.id : '',
    filename: content?.filename || '',
    size: content?.size || 0,
    mime: content?.mime || '',
    checksum: content?.checksum || '',
  }
}
function removeStoredFile(storageKey) {
  if (!storageKey) return
  const candidate = path.resolve(resourceFilesRoot, storageKey)
  if (candidate === resourceFilesRoot || !candidate.startsWith(`${resourceFilesRoot}${path.sep}`)) return
  try { unlinkSync(candidate) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
function removeProjectStoredFile(storageKey) {
  if (!storageKey) return
  const candidate = path.resolve(projectFilesRoot, storageKey)
  if (candidate === projectFilesRoot || !candidate.startsWith(`${projectFilesRoot}${path.sep}`)) return
  try { unlinkSync(candidate) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
function projectStoragePath(storageKey) {
  if (!storageKey) return null
  const candidate = path.resolve(projectFilesRoot, storageKey)
  if (candidate === projectFilesRoot || !candidate.startsWith(`${projectFilesRoot}${path.sep}`)) return null
  return candidate
}
function projectAssetUrl(row) {
  if (!row || row.availability !== 'available') return ''
  if (row.storage_key) return `/api/project-assets/${encodeURIComponent(row.id)}/file`
  if (row.source_type === 'legacy' && row.legacy_path && legacyAssetPathExists(row.kind, row.legacy_path)) {
    return `/projects/xiaoxueqi-2026/showcase-site/${row.legacy_path}`
  }
  return row.source_type === 'external' && /^https?:\/\//i.test(row.legacy_path || '') ? row.legacy_path : ''
}
function projectAssetRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    label: row.label,
    source_type: row.source_type,
    availability: row.availability,
    legacy_path: row.legacy_path || '',
    filename: row.filename || '',
    size: Number(row.size || 0),
    mime: row.mime || '',
    checksum: row.checksum || '',
    sort_order: Number(row.sort_order || 0),
    published: Boolean(row.published),
    url: projectAssetUrl(row),
    created_by: row.created_by || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || '',
  }
}
function audit(actorId, action, targetType, targetId, metadata = {}) {
  db.prepare('INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)' )
    .run(randomUUID(), actorId || null, action, targetType, targetId, JSON.stringify(safeMetadata(metadata)), new Date().toISOString())
}
function membershipRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    user_id: row.user_id,
    team: row.team,
    status: row.status,
    role: row.role,
    is_active: Boolean(row.is_active),
    joined_at: row.joined_at || null,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
function userMemberships(userId) {
  return db.prepare('SELECT id, user_id, team, status, role, is_active, joined_at, reviewed_by, reviewed_at, created_at, updated_at FROM team_memberships WHERE user_id = ? ORDER BY created_at ASC, id ASC')
    .all(userId).map(membershipRecord)
}
function hasApprovedMembership(userId, team) {
  return Boolean(userId && db.prepare(`SELECT id FROM team_memberships
    WHERE user_id = ? AND team = ? AND status = 'approved' AND is_active = 1`).get(userId, team))
}
function syncLegacyUserStatus(userId) {
  const statuses = db.prepare('SELECT status FROM team_memberships WHERE user_id = ? AND is_active = 1').all(userId).map(row => row.status)
  const status = statuses.includes('approved') ? 'approved' : statuses.includes('pending') ? 'pending' : 'rejected'
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId)
  return status
}
function ensureMembership(userId, team, status, actorId = null) {
  const now = new Date().toISOString()
  const existing = db.prepare('SELECT * FROM team_memberships WHERE user_id = ? AND team = ?').get(userId, team)
  if (existing) {
    db.prepare(`UPDATE team_memberships SET status = ?, is_active = 1, reviewed_by = ?, reviewed_at = ?,
      joined_at = ?, updated_at = ? WHERE id = ?`)
      .run(status, actorId, status === 'pending' ? null : now, status === 'approved' ? (existing.joined_at || now) : existing.joined_at, now, existing.id)
    return db.prepare('SELECT * FROM team_memberships WHERE id = ?').get(existing.id)
  }
  const id = randomUUID()
  db.prepare(`INSERT INTO team_memberships
    (id, user_id, team, status, role, is_active, joined_at, reviewed_by, reviewed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'member', 1, ?, ?, ?, ?, ?)`)
    .run(id, userId, team, status, status === 'approved' ? now : null, actorId, status === 'pending' ? null : now, now, now)
  return db.prepare('SELECT * FROM team_memberships WHERE id = ?').get(id)
}
function parseSitePayload(payload, fallback) {
  try {
    const value = JSON.parse(payload)
    return validateSitePayload(value)
  } catch {
    return fallback
  }
}
function parseAuditMetadata(payload) {
  try {
    const value = JSON.parse(payload)
    return value && typeof value === 'object' && !Array.isArray(value) ? safeMetadata(value) : {}
  } catch {
    return {}
  }
}
export function getSiteContent(fallback) {
  try { validateSitePayload(fallback); validateSitePayloadSize(fallback) } catch { throw new Error('Invalid default site content') }
  const row = db.prepare('SELECT payload FROM site_pages WHERE key = ? AND published = 1').get('site')
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO site_pages (key, title, payload, published, updated_at) VALUES (?, ?, ?, 1, ?)')
      .run('site', '实验室官网内容', JSON.stringify(fallback), new Date().toISOString())
    return fallback
  }
  return parseSitePayload(row.payload, fallback)
}
export function updateSiteSection(section, value, actorId, fallback) {
  if (!siteSections.includes(section)) throw new Error('Invalid site content section')
  validateSiteSection(section, value)
  const current = getSiteContent(fallback)
  const payload = JSON.stringify({ ...current, [section]: value })
  validateSitePayload(JSON.parse(payload))
  validateSitePayloadSize(JSON.parse(payload))
  if (Buffer.byteLength(payload) > maxSitePayloadLength) throw new Error('Site content is too large')
  db.prepare('UPDATE site_pages SET payload = ?, updated_at = ? WHERE key = ?')
    .run(payload, new Date().toISOString(), 'site')
  audit(actorId, 'site.update', 'site_pages', 'site', { section })
  return JSON.parse(payload)
}
export function auditLogs() {
  return db.prepare('SELECT id, actor_id, action, target_type, target_id, metadata, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200')
    .all().map(row => ({ ...row, metadata: parseAuditMetadata(row.metadata) }))
}

const announcementKinds = new Set(['notice', 'news'])
const announcementStatuses = new Set(['draft', 'published', 'offline'])

function announcementRecord(row, includeBody = false) {
  if (!row) return null
  const result = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    status: row.status,
    pinned: Boolean(row.pinned),
    sort_order: Number(row.sort_order || 0),
    published_at: row.published_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
  if (includeBody) result.body = row.body
  return result
}

function announcementInput(input = {}, existing = null) {
  const slug = String(input.slug ?? existing?.slug ?? '').trim().toLowerCase()
  const title = String(input.title ?? existing?.title ?? '').trim()
  const summary = String(input.summary ?? existing?.summary ?? '').trim()
  const body = String(input.body ?? existing?.body ?? '').trim()
  const kind = String(input.kind ?? existing?.kind ?? 'notice').trim()
  const status = String(input.status ?? existing?.status ?? 'draft').trim()
  const pinned = input.pinned === undefined ? Boolean(existing?.pinned ?? false) : Boolean(input.pinned)
  const sortOrder = Number(input.sort_order ?? input.sortOrder ?? existing?.sort_order ?? 0)
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !title || title.length > 160 || summary.length > 500 || !body || body.length > 20000 ||
      !announcementKinds.has(kind) || !announcementStatuses.has(status) || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw new Error('Invalid announcement fields')
  }
  return { slug, title, summary, body, kind, status, pinned, sort_order: sortOrder }
}

function announcementPublicFilter(now = new Date().toISOString()) {
  return { now }
}

export function listAnnouncements() {
  const now = new Date().toISOString()
  return db.prepare(`SELECT * FROM announcements
    WHERE status = 'published' AND (published_at IS NULL OR published_at <= ?)
    ORDER BY pinned DESC, sort_order ASC, published_at DESC, id ASC`).all(now).map(row => announcementRecord(row))
}

export function getAnnouncement(ref) {
  const now = new Date().toISOString()
  const row = db.prepare(`SELECT * FROM announcements
    WHERE (id = ? OR slug = ?) AND status = 'published' AND (published_at IS NULL OR published_at <= ?)`)
    .get(String(ref), String(ref), now)
  return announcementRecord(row, true)
}

export function adminAnnouncements() {
  return db.prepare('SELECT * FROM announcements ORDER BY status ASC, pinned DESC, sort_order ASC, updated_at DESC, id ASC')
    .all().map(row => announcementRecord(row, true))
}

export function createAnnouncement(input, actorId) {
  const value = announcementInput(input)
  const now = new Date().toISOString()
  const id = randomUUID()
  const publishedAt = value.status === 'published' ? now : null
  try {
    db.prepare(`INSERT INTO announcements
      (id, slug, title, summary, body, kind, status, pinned, sort_order, published_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, value.slug, value.title, value.summary, value.body, value.kind, value.status, value.pinned ? 1 : 0,
        value.sort_order, publishedAt, actorId || null, now, now)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error('公告标识已存在')
    throw error
  }
  audit(actorId, value.status === 'published' ? 'announcement.publish' : 'announcement.create', 'announcements', id,
    { slug: value.slug, status: value.status })
  return announcementRecord(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id), true)
}

export function updateAnnouncement(id, input, actorId) {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id)
  if (!existing) throw new Error('Announcement not found')
  const value = announcementInput(input, existing)
  const now = new Date().toISOString()
  const publishedAt = value.status === 'published' ? (existing.published_at || now) : existing.published_at
  try {
    db.prepare(`UPDATE announcements SET slug = ?, title = ?, summary = ?, body = ?, kind = ?, status = ?, pinned = ?,
      sort_order = ?, published_at = ?, updated_at = ? WHERE id = ?`)
      .run(value.slug, value.title, value.summary, value.body, value.kind, value.status, value.pinned ? 1 : 0,
        value.sort_order, publishedAt, now, id)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error('公告标识已存在')
    throw error
  }
  const action = value.status === 'published' && existing.status !== 'published' ? 'announcement.publish' : 'announcement.update'
  audit(actorId, action, 'announcements', id, { slug: value.slug, status: value.status })
  return announcementRecord(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id), true)
}

export function offlineAnnouncement(id, actorId) {
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id)
  if (!existing) throw new Error('Announcement not found')
  if (existing.status !== 'offline') {
    db.prepare('UPDATE announcements SET status = ?, updated_at = ? WHERE id = ?').run('offline', new Date().toISOString(), id)
    audit(actorId, 'announcement.offline', 'announcements', id, { slug: existing.slug })
  }
  return announcementRecord(db.prepare('SELECT * FROM announcements WHERE id = ?').get(id), true)
}

const projectCategories = {
  hardware: '硬件实物',
  software: '软件系统',
  game: '仿真交互',
}
const projectJsonFields = ['tags', 'highlights', 'outcomes', 'tech', 'media', 'videos', 'files']
function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
function projectAssetList(value, max = 24) {
  if (!Array.isArray(value)) return []
  return value.map(asset => {
    if (typeof asset === 'string') return asset.trim()
    if (!asset || typeof asset !== 'object') return null
    const label = String(asset.label || '').trim()
    const assetPath = String(asset.path || asset.url || '').trim()
    return label && assetPath ? { label: label.slice(0, 160), path: assetPath.slice(0, 500) } : null
  }).filter(Boolean).slice(0, max)
}
function projectTextList(value, max = 24) {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item || '').trim()).filter(Boolean).slice(0, max)
}
function projectRecord(row) {
  if (!row) return null
  const result = { ...row }
  delete result.project_group
  for (const field of projectJsonFields) result[field] = parseJsonArray(row[field])
  result.group = row.project_group
  result.group_label = row.project_group
  result.created_at = row.created_at
  result.updated_at = row.updated_at
  return result
}
function projectWithAssets(row, user = null) {
  const result = projectRecord(row)
  if (!result) return null
  result.assets = listProjectAssetRows(row.id, user) || []
  return result
}
function readStaticProjects() {
  const file = path.resolve('public/projects/xiaoxueqi-2026/showcase-site/data.json')
  if (!existsSync(file)) return []
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
function seedProjects() {
  if (db.prepare('SELECT COUNT(*) AS count FROM projects').get().count > 0) return
  const now = new Date().toISOString()
  const insert = db.prepare(`INSERT OR IGNORE INTO projects
    (id, legacy_id, edition, slug, project_group, category, category_label, title, subtitle, summary, tags, highlights, outcomes, tech, members, media, videos, files, accent, sort_order, status, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  for (const [index, source] of readStaticProjects().entries()) {
    const category = projectCategories[source.category] ? source.category : 'software'
    insert.run(
      String(source.id || randomUUID()), String(source.id || '').trim() || null, 'xiaoxueqi-2026', String(source.id || '').trim() || randomUUID(), String(source.group || '').trim().slice(0, 120), category,
      String(source.categoryLabel || projectCategories[category]).trim().slice(0, 80), String(source.title || '').trim().slice(0, 200), String(source.subtitle || '').trim().slice(0, 300),
      String(source.summary || '').trim().slice(0, 2000), JSON.stringify(projectTextList(source.tags)), JSON.stringify(projectTextList(source.highlights)), JSON.stringify(projectTextList(source.outcomes)), JSON.stringify(projectTextList(source.tech)),
      String(source.members || '').trim().slice(0, 500), JSON.stringify(projectAssetList(source.media)), JSON.stringify(projectAssetList(source.videos)), JSON.stringify(projectAssetList(source.files)), String(source.accent || 'cyan').trim().slice(0, 40), index, 'published', now, now, null,
    )
  }
}
function legacyAssetPathExists(kind, legacyPath) {
  if (!['image', 'video', 'file'].includes(kind) || !legacyPath || legacyPath.startsWith('../') || /^https?:\/\//i.test(legacyPath)) return false
  const root = path.resolve('public/projects/xiaoxueqi-2026/showcase-site')
  const candidate = path.resolve(root, legacyPath)
  if (!candidate.startsWith(`${root}${path.sep}`)) return false
  try { return statSync(candidate).isFile() } catch { return false }
}
function seedProjectAssets() {
  const sources = readStaticProjects()
  if (!sources.length) return
  const insert = db.prepare(`INSERT OR IGNORE INTO project_assets
    (id, project_id, kind, label, source_type, availability, legacy_path, storage_key, filename, size, mime, checksum, sort_order, published, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'legacy', ?, ?, NULL, NULL, 0, NULL, NULL, ?,  ?, NULL, ?, ?)`)
  const now = new Date().toISOString()
  for (const source of sources) {
    const project = db.prepare('SELECT id FROM projects WHERE legacy_id = ? OR id = ? LIMIT 1').get(String(source.id || ''), String(source.id || ''))
    if (!project) continue
    for (const [kind, values] of [['image', source.media], ['video', source.videos], ['file', source.files]]) {
      if (!Array.isArray(values)) continue
      values.forEach((value, index) => {
        const label = typeof value === 'string' ? path.basename(value) : String(value?.label || value?.path || '').trim()
        const legacyPath = typeof value === 'string' ? value.trim() : String(value?.path || value?.url || '').trim()
        if (!legacyPath) return
        const available = legacyAssetPathExists(kind, legacyPath)
        insert.run(randomUUID(), project.id, kind, label.slice(0, 160) || legacyPath.slice(0, 160), available ? 'available' : 'missing', legacyPath.slice(0, 500), index, available ? 1 : 0, now, now)
      })
    }
  }
}
seedProjects()
seedProjectAssets()
function teamRecord(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    caption: row.caption,
    image: row.image,
    intro: row.intro,
    learn: parseJsonArray(row.learn),
    practice: row.practice,
    sort_order: row.sort_order,
    enabled: Boolean(row.enabled),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
function seedTeams() {
  const now = new Date().toISOString()
  const insert = db.prepare(`INSERT OR IGNORE INTO teams
    (id, code, name, caption, image, intro, learn, practice, sort_order, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  teamDefaults.forEach((team, index) => insert.run(team.id, team.id, team.name, team.caption, team.image, team.intro, JSON.stringify(team.learn), team.practice, index + 1, 1, now, now))
}
seedTeams()
export function listTeams({ includeDisabled = false } = {}) {
  const rows = db.prepare(`SELECT * FROM teams ${includeDisabled ? '' : 'WHERE enabled = 1'} ORDER BY sort_order ASC, name ASC`).all()
  return rows.map(teamRecord)
}
export function getTeam(id, { includeDisabled = false } = {}) {
  const row = db.prepare(`SELECT * FROM teams WHERE (id = ? OR code = ?) ${includeDisabled ? '' : 'AND enabled = 1'}`).get(id, id)
  return teamRecord(row)
}
function teamInput(input = {}, existing = null) {
  const name = String(input.name ?? existing?.name ?? '').trim()
  const caption = String(input.caption ?? existing?.caption ?? '').trim()
  const image = String(input.image ?? existing?.image ?? '').trim()
  const intro = String(input.intro ?? existing?.intro ?? '').trim()
  const practice = String(input.practice ?? existing?.practice ?? '').trim()
  const sourceLearn = input.learn ?? existing?.learn
  const learn = Array.isArray(sourceLearn) ? sourceLearn.map(item => String(item || '').trim()).filter(Boolean).slice(0, 12) : []
  const sortOrder = Number.isInteger(Number(input.sort_order ?? input.sortOrder ?? existing?.sort_order ?? 0)) ? Number(input.sort_order ?? input.sortOrder ?? existing?.sort_order ?? 0) : 0
  const enabled = input.enabled === undefined ? Boolean(existing?.enabled ?? true) : Boolean(input.enabled)
  if (!name || name.length > 80 || !caption || caption.length > 160 || !image || image.length > 500 || !intro || intro.length > 2000 || !practice || practice.length > 1000 || !learn.length || learn.some(item => item.length > 160) || sortOrder < 0 || sortOrder > 9999) throw new Error('Invalid team fields')
  return { name, caption, image, intro, learn, practice, sort_order: sortOrder, enabled }
}
export function updateTeam(id, input, actorId) {
  const existing = getTeam(id, { includeDisabled: true })
  if (!existing) throw new Error('Team not found')
  const value = teamInput(input, existing)
  const now = new Date().toISOString()
  db.prepare('UPDATE teams SET name = ?, caption = ?, image = ?, intro = ?, learn = ?, practice = ?, sort_order = ?, enabled = ?, updated_at = ? WHERE id = ?')
    .run(value.name, value.caption, value.image, value.intro, JSON.stringify(value.learn), value.practice, value.sort_order, value.enabled ? 1 : 0, now, existing.id)
  audit(actorId, 'team.update', 'teams', existing.id, { code: existing.code, enabled: value.enabled })
  return teamRecord(db.prepare('SELECT * FROM teams WHERE id = ?').get(existing.id))
}
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
function teamAcceptsApplications(team) {
  return Boolean(db.prepare('SELECT id FROM teams WHERE code = ? AND enabled = 1').get(team))
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected)
}
export function createAdmin(email, name, password) {
  email = String(email || '').trim().toLowerCase()
  name = String(name || '').trim()
  if (!email || typeof password !== 'string' || password.length < 12) throw new Error('Admin email and password of 12+ characters required')
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new Error('Account exists')
  const id = randomUUID()
  db.prepare('INSERT INTO users (id, email, name, password_hash, team, status, role) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, email, name, hashPassword(password), 'software', 'approved', 'admin')
  ensureMembership(id, 'software', 'approved')
}
export function apply({ studentId, email, name, username, password, team, statement, role = 'student' }) {
  studentId = String(studentId || '').trim()
  name = String(name || '').trim()
  username = String(username || '').trim().toLowerCase()
  statement = String(statement || '').trim()
  email = String(email || '').trim().toLowerCase()
  if (!['student', 'teacher'].includes(role)) throw new Error('请选择学生或老师身份')
  if (role === 'teacher' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error('请输入有效的老师邮箱')
  if (role === 'student' && !/^\d{11}$/.test(studentId)) throw new Error('学号应为 11 位数字')
  if (username && !/^[a-z][a-z0-9_.-]{2,29}$/.test(username)) throw new Error('用户名须为 3-30 位小写英文，以字母开头，可包含字母、数字、_、-、.')
  if (!name || name.length > 80 || typeof password !== 'string' || password.length < 6 || password.length > 128 ||
      !teams.includes(team) || statement.length > 1000) throw new Error('Invalid application fields')
  if (!teamAcceptsApplications(team)) throw new Error('Team is not accepting applications')
  if (username && username.length > 30) throw new Error('用户名不能超过 30 个字符')
  if (role === 'teacher' && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new Error('邮箱已被注册')
  if (role === 'student' && db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId)) throw new Error('学号已被注册')
  if (username && db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new Error('用户名已被使用')
  const grade = role === 'student' ? studentId.slice(0, 2) + '级' : null
  const userId = randomUUID(), id = randomUUID()
  const passwordHash = hashPassword(password)
  db.exec('BEGIN')
  try {
    if (!teamAcceptsApplications(team)) throw new Error('Team is not accepting applications')
    db.prepare('INSERT INTO users (id, email, student_id, username, name, grade, password_hash, team, status, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, role === 'teacher' ? email : null, role === 'student' ? studentId : null, username || null, name, grade, passwordHash, team, 'pending', role)
    ensureMembership(userId, team, 'pending')
    db.prepare('INSERT INTO applications (id, user_id, team, statement, status, created_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, team, statement, 'pending', new Date().toISOString(), null)
    audit(userId, 'application.submit', 'applications', id, { status: 'pending', team })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (error.message.includes('UNIQUE')) {
      if (error.message.includes('users.student_id')) throw new Error('学号已被注册')
      if (error.message.includes('users.username')) throw new Error('用户名已被使用')
      throw new Error('该账号已被注册')
    }
    throw error
  }
  return { id, status: 'pending' }
}
export function publicUser(user) {
  const memberships = Array.isArray(user.memberships) ? user.memberships : userMemberships(user.id)
  return { id: user.id, email: user.email, studentId: user.student_id, username: user.username, name: user.name, grade: user.grade, team: user.team, primaryTeam: user.team, status: user.status, role: user.role, isActive: Boolean(user.is_active ?? 1), memberships }
}
export function login(account, password) {
  account = String(account || '').trim()
  if (/^\d+$/.test(account) && !/^\d{11}$/.test(account)) throw new Error('学号应为 11 位数字')
  let user = db.prepare('SELECT * FROM users WHERE student_id = ?').get(account)
  if (!user) user = db.prepare('SELECT * FROM users WHERE username = ?').get(account)
  if (!user) user = db.prepare('SELECT * FROM users WHERE email = ?').get(account.toLowerCase())
  if (!user || !user.is_active || typeof password !== 'string' || password.length > 128 || !verifyPassword(password, user.password_hash)) return null
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(token), user.id, Date.now() + 7 * 86400000)
  return { token, user: publicUser(user) }
}
export function currentUser(token) {
  if (!token) return null
  const user = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1').get(hashToken(token), Date.now())
  return user ? publicUser(user) : null
}
export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}
export function changePassword(userId, oldPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) throw new Error('Invalid new password')
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId)
  if (!user || !verifyPassword(String(oldPassword || ''), user.password_hash)) throw new Error('Invalid old password')
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    audit(userId, 'member.password', 'users', userId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
export function applications() {
  return db.prepare(`SELECT a.id, a.user_id, a.team, a.statement, a.status, a.created_at, a.reviewed_at,
    u.name, u.email, u.student_id, u.username, u.grade, u.team AS primary_team, u.role
    FROM applications a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC`).all().map(row => ({ ...row, team: row.team || row.primary_team }))
}
export function members() {
  return db.prepare('SELECT id, email, student_id, username, name, grade, team, status, role, is_active, rowid AS sort_id FROM users ORDER BY sort_id DESC')
    .all().map(row => ({ ...row, memberships: userMemberships(row.id) }))
}
export function setMemberActive(id, isActive, actorId) {
  if (typeof isActive !== 'boolean') throw new Error('Invalid active state')
  const member = db.prepare('SELECT role FROM users WHERE id = ?').get(id)
  if (!member) throw new Error('Member not found')
  if (member.role === 'admin') throw new Error('Administrator account cannot be disabled')
  db.exec('BEGIN')
  try {
    const result = db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id)
    if (!result.changes) throw new Error('Member not found')
    db.prepare('UPDATE team_memberships SET is_active = ?, updated_at = ? WHERE user_id = ?').run(isActive ? 1 : 0, new Date().toISOString(), id)
    if (!isActive) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    audit(actorId, 'member.active', 'users', id, { isActive: Boolean(isActive) })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
export function resetMemberPassword(id, password, actorId) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('Invalid temporary password')
  }
  const member = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id)
  if (!member) throw new Error('Member not found')
  if (!['member', 'student'].includes(member.role)) throw new Error('Administrator account cannot be reset here')
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE users SET password_hash = ?, is_active = 1 WHERE id = ?')
      .run(hashPassword(password), id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    audit(actorId, 'member.password_reset', 'users', id, { activated: true })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { reauthenticate: true, activated: true }
}
export function review(id, status, actorId) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid review status')
  db.exec('BEGIN')
  try {
    const application = db.prepare(`SELECT a.id, a.user_id, COALESCE(NULLIF(a.team, ''), u.team) AS team, a.status
      FROM applications a JOIN users u ON u.id = a.user_id WHERE a.id = ?`).get(id)
    if (!application || application.status !== 'pending') throw new Error('Application already processed or missing')
    if (status === 'approved' && !teamAcceptsApplications(application.team)) throw new Error('Team is not accepting applications')
    const reviewedAt = new Date().toISOString()
    const result = db.prepare("UPDATE applications SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").run(status, reviewedAt, id)
    if (!result.changes) throw new Error('Application already processed or missing')
    ensureMembership(application.user_id, application.team, status, actorId)
    syncLegacyUserStatus(application.user_id)
    audit(actorId, 'application.review', 'applications', id, { from: application.status, to: status })
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}
export function applyTeam(userId, team, statement = '') {
  team = String(team || '').trim()
  statement = String(statement || '').trim()
  if (!teams.includes(team) || statement.length > 1000) throw new Error('Invalid membership application fields')
  if (!teamAcceptsApplications(team)) throw new Error('Team is not accepting applications')
  const user = db.prepare('SELECT id, role, is_active FROM users WHERE id = ?').get(userId)
  if (!user || !['member', 'student'].includes(user.role) || !user.is_active) throw new Error('Active member account required')
  const existing = db.prepare('SELECT status, is_active FROM team_memberships WHERE user_id = ? AND team = ?').get(userId, team)
  if (existing && existing.is_active && ['pending', 'approved'].includes(existing.status)) throw new Error('该团队申请已存在')
  const id = randomUUID()
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    if (!teamAcceptsApplications(team)) throw new Error('Team is not accepting applications')
    ensureMembership(userId, team, 'pending')
    db.prepare('INSERT INTO applications (id, user_id, team, statement, status, created_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, team, statement, 'pending', now, null)
    syncLegacyUserStatus(userId)
    audit(userId, 'membership.apply', 'team_memberships', team, { team, status: 'pending' })
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { id, team, status: 'pending' }
}
export function memberships() {
  return db.prepare(`SELECT m.*, u.name, u.student_id, u.username, u.grade, u.role AS user_role
    FROM team_memberships m JOIN users u ON u.id = m.user_id
    ORDER BY m.created_at DESC, m.id DESC`).all().map(row => ({ ...membershipRecord(row), name: row.name, student_id: row.student_id, username: row.username, grade: row.grade, user_role: row.user_role }))
}
export function revokeMembership(id, actorId) {
  const membership = db.prepare('SELECT m.*, u.role AS user_role FROM team_memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(id)
  if (!membership) throw new Error('Membership not found')
  if (membership.user_role === 'admin') throw new Error('Administrator membership cannot be revoked')
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE team_memberships SET status = ?, is_active = 0, updated_at = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?')
      .run('revoked', new Date().toISOString(), actorId, new Date().toISOString(), id)
    syncLegacyUserStatus(membership.user_id)
    audit(actorId, 'membership.revoke', 'team_memberships', id, { team: membership.team })
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return membershipRecord(db.prepare('SELECT * FROM team_memberships WHERE id = ?').get(id))
}
export function restoreMembership(id, actorId) {
  const membership = db.prepare('SELECT m.*, u.role AS user_role FROM team_memberships m JOIN users u ON u.id = m.user_id WHERE m.id = ?').get(id)
  if (!membership) throw new Error('Membership not found')
  if (membership.user_role === 'admin') throw new Error('Administrator membership cannot be changed here')
  db.exec('BEGIN')
  try {
    ensureMembership(membership.user_id, membership.team, 'approved', actorId)
    syncLegacyUserStatus(membership.user_id)
    audit(actorId, 'membership.restore', 'team_memberships', id, { team: membership.team })
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return membershipRecord(db.prepare('SELECT * FROM team_memberships WHERE id = ? AND user_id = ?').get(id, membership.user_id))
}
export function listResources(user = null) {
  const records = db.prepare("SELECT id, team, title, summary, visibility, status, created_at FROM resources WHERE status = 'published' AND visibility <> 'admin' ORDER BY created_at DESC").all()
  return [
    ...catalog.map(({ body, attachments, ...summary }) => summary),
    ...records.map(resourceSummary),
  ]
}
export function listAdminResources() {
  return db.prepare('SELECT id, team, title, summary, visibility, status, created_at FROM resources ORDER BY created_at DESC').all().map(adminResourceSummary)
}
const resourceStatuses = new Set(['draft', 'published', 'offline'])
function resourceStatus(value, fallback = 'published') {
  const status = String(value ?? fallback).trim()
  if (!resourceStatuses.has(status)) throw new Error('Invalid resource status')
  return status
}
export function approved(user) { return !!user && user.status === 'approved' }
export function staff(user) { return approved(user) && ['admin', 'teacher'].includes(user.role) }
function requireApproved(user) { if (!approved(user)) throw new Error('请先登录并等待管理员审核通过') }
export function getResource(id, user) {
  const bundled = catalog.find(item => item.id === id)
  if (bundled) return bundled
  const item = db.prepare('SELECT * FROM resources WHERE id = ?').get(id)
  if (!item) return null
  if (item.status !== 'published' && user?.role !== 'admin') return false
  if (item.visibility === 'admin' && user?.role !== 'admin') return false
  if (item.visibility !== 'public' && !(user?.role === 'admin' || hasApprovedMembership(user?.id, item.team))) return false
  return { ...resourceContent(item), attachments: attachmentDetails(JSON.parse(item.attachments || '[]')) }
}
function attachmentDetails(ids) {
  return ids.map(id => {
    const file = db.prepare('SELECT id, name, mime, size FROM uploads WHERE id = ?').get(id)
    return file && { ...file, url: `/api/files/${file.id}` }
  }).filter(Boolean)
}
function validateAttachments(ids, user, purpose) {
  if (!Array.isArray(ids) || ids.length > 10 || new Set(ids).size !== ids.length) throw new Error('每次最多上传 10 个不同附件')
  for (const id of ids) {
    if (typeof id !== 'string') throw new Error('附件无效')
    const file = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)
    if (!file || file.owner_id !== user.id || file.purpose !== purpose || file.entity_id) throw new Error('附件无效、已使用或不属于当前账号')
  }
}
function bindAttachments(ids, entityId) {
  for (const id of ids) db.prepare('UPDATE uploads SET entity_id = ? WHERE id = ?').run(entityId, id)
}
export function addResource({ team, title, summary, visibility, body, status, attachments = [] }, user) {
  title = String(title || '').trim(); summary = String(summary || '').trim(); body = String(body || '').trim()
  status = resourceStatus(status)
  if (!teams.includes(team) || !['public', 'team', 'admin'].includes(visibility) || !title || title.length > 120 ||
      !summary || summary.length > 500 || (!body && !attachments.length) || body.length > 30000) throw new Error('Invalid resource fields')
  if (!user || user.role !== 'admin' || !approved(user)) throw new Error('Administrator required')
  validateAttachments(attachments, user, 'resource')
  const id = randomUUID()
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO resources (id, team, title, summary, visibility, body, status, created_at, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, team, title, summary, visibility, body, status, now, JSON.stringify(attachments))
    db.prepare('INSERT INTO resource_contents (id, resource_id, body, storage_key, filename, size, mime, checksum, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?, ?)')
      .run(randomUUID(), id, body, '', '', '', now, now)
    bindAttachments(attachments, id)
    audit(user.id, status === 'published' ? 'resource.publish' : 'resource.create', 'resources', id, { team, visibility, status })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return resourceSummary(db.prepare('SELECT * FROM resources WHERE id = ?').get(id))
}
export function updateResource(id, { team, title, summary, visibility, body, status }, actorId) {
  title = String(title || '').trim(); summary = String(summary || '').trim(); body = String(body || '').trim()
  if (!teams.includes(team) || !['public', 'team', 'admin'].includes(visibility) || !title || title.length > 120 ||
      !summary || summary.length > 500 || !body || body.length > 30000) throw new Error('Invalid resource fields')
  db.exec('BEGIN')
  try {
    const existing = db.prepare('SELECT status FROM resources WHERE id = ?').get(id)
    if (!existing) throw new Error('Resource not found')
    const nextStatus = resourceStatus(status, existing.status || 'published')
    const result = db.prepare('UPDATE resources SET team = ?, title = ?, summary = ?, visibility = ?, body = ?, status = ? WHERE id = ?')
      .run(team, title, summary, visibility, body, nextStatus, id)
    if (!result.changes) throw new Error('Resource not found')
    db.prepare('UPDATE resource_contents SET body = ?, updated_at = ? WHERE resource_id = ?').run(body, new Date().toISOString(), id)
    const action = existing.status !== nextStatus
      ? (nextStatus === 'published' ? 'resource.publish' : nextStatus === 'offline' ? 'resource.offline' : 'resource.draft')
      : 'resource.update'
    audit(actorId, action, 'resources', id, { team, visibility, status: nextStatus })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return resourceSummary(db.prepare('SELECT * FROM resources WHERE id = ?').get(id))
}
export function deleteResource(id, actorId) {
  return setResourceStatus(id, 'offline', actorId)
}
export function setResourceStatus(id, status, actorId) {
  status = resourceStatus(status)
  db.exec('BEGIN')
  try {
    const existing = db.prepare('SELECT status FROM resources WHERE id = ?').get(id)
    if (!existing) throw new Error('Resource not found')
    if (existing.status !== status) {
      db.prepare('UPDATE resources SET status = ? WHERE id = ?').run(status, id)
      const action = status === 'published' ? 'resource.publish' : status === 'offline' ? 'resource.offline' : 'resource.draft'
      audit(actorId, action, 'resources', id, { from_status: existing.status, status })
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return resourceSummary(db.prepare('SELECT * FROM resources WHERE id = ?').get(id))
}

const mimeByExtension = new Map([
  ['.pdf', 'application/pdf'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'],
  ['.txt', 'text/plain'], ['.zip', 'application/zip'], ['.doc', 'application/msword'], ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'], ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
])
function normalizedResourceMime(filename, mime) {
  const value = String(mime || '').split(';')[0].trim().toLowerCase()
  if (RESOURCE_FILE_MIME_TYPES.has(value)) return value
  if (!value || value === 'application/octet-stream') return mimeByExtension.get(resourceFileExtension(filename)) || ''
  return ''
}
function storedResourcePath(storageKey) {
  const candidate = path.resolve(resourceFilesRoot, String(storageKey || ''))
  if (!storageKey || candidate === resourceFilesRoot || !candidate.startsWith(`${resourceFilesRoot}${path.sep}`)) throw new Error('Invalid resource file path')
  return candidate
}
export function saveResourceFile(id, { filename, mime, size, data }, actorId) {
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(id)
  if (!resource) throw new Error('Resource not found')
  if (!Buffer.isBuffer(data)) throw new Error('Invalid resource file')
  const actualSize = Number(size || data.length)
  if (!actualSize || actualSize !== data.length || actualSize > RESOURCE_FILE_MAX_BYTES) throw new Error('附件不能超过 30 MiB')
  const safeName = path.basename(String(filename || '')).trim().slice(0, 180)
  const normalizedMime = normalizedResourceMime(safeName, mime)
  if (!safeName || !normalizedMime || !RESOURCE_FILE_MIME_TYPES.has(normalizedMime)) throw new Error('不支持的附件类型')
  const extension = resourceFileExtension(safeName)
  const storageKey = `${id}/${randomUUID()}${extension}`
  const target = storedResourcePath(storageKey)
  const tempKey = `${id}/.${randomUUID()}.upload`
  const temp = storedResourcePath(tempKey)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(temp, data, { flag: 'wx' })
  const checksum = createHash('sha256').update(data).digest('hex')
  const now = new Date().toISOString()
  const previous = db.prepare('SELECT storage_key FROM resource_contents WHERE resource_id = ?').get(id)?.storage_key || ''
  try {
    renameSync(temp, target)
    db.exec('BEGIN')
    db.prepare(`INSERT INTO resource_contents (id, resource_id, body, storage_key, filename, size, mime, checksum, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(resource_id) DO UPDATE SET storage_key = excluded.storage_key, filename = excluded.filename, size = excluded.size, mime = excluded.mime, checksum = excluded.checksum, updated_at = excluded.updated_at`)
      .run(randomUUID(), id, resource.body, storageKey, safeName, actualSize, normalizedMime, checksum, now, now)
    audit(actorId, 'resource.file.replace', 'resources', id, { filename: safeName, size: actualSize, mime: normalizedMime })
    db.exec('COMMIT')
  } catch (error) {
    try { removeStoredFile(storageKey) } catch {}
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }
  if (previous && previous !== storageKey) removeStoredFile(previous)
  return resourceContent(db.prepare('SELECT * FROM resources WHERE id = ?').get(id))
}
export function removeResourceFile(id, actorId) {
  const content = db.prepare('SELECT storage_key FROM resource_contents WHERE resource_id = ?').get(id)
  if (!db.prepare('SELECT id FROM resources WHERE id = ?').get(id)) throw new Error('Resource not found')
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE resource_contents SET storage_key = NULL, filename = \'\', size = 0, mime = \'\', checksum = \'\', updated_at = ? WHERE resource_id = ?').run(new Date().toISOString(), id)
    audit(actorId, 'resource.file.remove', 'resources', id)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  if (content?.storage_key) removeStoredFile(content.storage_key)
  return resourceContent(db.prepare('SELECT * FROM resources WHERE id = ?').get(id))
}
export function getResourceFile(id, user) {
  const resource = getResource(id, user)
  if (resource === false) return false
  if (!resource) return null
  if (!resource.storage_key) return null
  const file = db.prepare('SELECT storage_key, filename, size, mime, checksum FROM resource_contents WHERE resource_id = ?').get(id)
  if (!file?.storage_key) return null
  return { ...file, data: readFileSync(storedResourcePath(file.storage_key)) }
}

function projectInput(input = {}, existing = null) {
  const category = String(input.category ?? existing?.category ?? '').trim()
  const slug = String(input.slug ?? existing?.slug ?? '').trim().toLowerCase()
  const legacyId = String(input.legacy_id ?? input.legacyId ?? existing?.legacy_id ?? '').trim() || null
  const edition = String(input.edition ?? existing?.edition ?? 'custom').trim().slice(0, 80) || 'custom'
  const sortOrder = Number.isInteger(Number(input.sort_order ?? input.sortOrder ?? existing?.sort_order ?? 0)) ? Number(input.sort_order ?? input.sortOrder ?? existing?.sort_order ?? 0) : 0
  const status = String(input.status ?? existing?.status ?? 'published').trim()
  const title = String(input.title ?? existing?.title ?? '').trim()
  const summary = String(input.summary ?? existing?.summary ?? '').trim()
  const subtitle = String(input.subtitle ?? existing?.subtitle ?? '').trim()
  const projectGroup = String(input.group ?? input.project_group ?? existing?.project_group ?? existing?.group ?? '').trim()
  const categoryLabel = String(input.categoryLabel ?? input.category_label ?? existing?.category_label ?? projectCategories[category] ?? '').trim()
  const members = String(input.members ?? existing?.members ?? '').trim()
  const accent = String(input.accent ?? existing?.accent ?? 'cyan').trim()
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || !projectCategories[category] || !['draft', 'published', 'offline'].includes(status) ||
      !title || title.length > 200 || !subtitle || subtitle.length > 300 || !summary || summary.length > 2000 ||
      !projectGroup || projectGroup.length > 120 || !categoryLabel || categoryLabel.length > 80 || members.length > 500 || accent.length > 40) {
    throw new Error('Invalid project fields')
  }
  const tags = projectTextList(input.tags ?? existing?.tags)
  const highlights = projectTextList(input.highlights ?? existing?.highlights)
  const outcomes = projectTextList(input.outcomes ?? existing?.outcomes)
  const tech = projectTextList(input.tech ?? existing?.tech)
  const media = projectAssetList(input.media ?? existing?.media)
  const videos = projectAssetList(input.videos ?? existing?.videos)
  const files = projectAssetList(input.files ?? existing?.files)
  if (Buffer.byteLength(JSON.stringify({ tags, highlights, outcomes, tech, media, videos, files }), 'utf8') > 50000) throw new Error('Project media metadata is too large')
  return { legacy_id: legacyId, edition, slug, project_group: projectGroup, category, category_label: categoryLabel, title, subtitle, summary, tags, highlights, outcomes, tech, members, media, videos, files, accent, sort_order: Math.max(0, Math.min(sortOrder, 9999)), status }
}
export function listProjects(user = null) {
  const rows = db.prepare("SELECT * FROM projects WHERE status = 'published' ORDER BY edition, sort_order ASC, COALESCE(published_at, created_at) DESC, created_at DESC").all()
  return rows.map(row => projectWithAssets(row, user))
}
export function listAdminProjects() {
  const rows = db.prepare('SELECT * FROM projects ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC').all()
  return rows.map(row => projectWithAssets(row, { role: 'admin' }))
}
export function getProject(id, user = null) {
  const row = db.prepare('SELECT * FROM projects WHERE (id = ? OR slug = ?) AND (? = 1 OR status = \'published\')').get(id, id, user?.role === 'admin' ? 1 : 0)
  return projectWithAssets(row, user)
}
export function addProject(input, actorId) {
  const value = projectInput(input)
  const id = randomUUID()
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    db.prepare(`INSERT INTO projects
      (id, legacy_id, edition, slug, project_group, category, category_label, title, subtitle, summary, tags, highlights, outcomes, tech, members, media, videos, files, accent, sort_order, status, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, value.legacy_id, value.edition, value.slug, value.project_group, value.category, value.category_label, value.title, value.subtitle, value.summary, JSON.stringify(value.tags), JSON.stringify(value.highlights), JSON.stringify(value.outcomes), JSON.stringify(value.tech), value.members, JSON.stringify(value.media), JSON.stringify(value.videos), JSON.stringify(value.files), value.accent, value.sort_order, value.status, now, now, value.status === 'published' ? now : null)
    audit(actorId, 'project.create', 'projects', id, { slug: value.slug, status: value.status })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (String(error.message).includes('UNIQUE')) throw new Error('项目标识已存在')
    throw error
  }
  return projectWithAssets(db.prepare('SELECT * FROM projects WHERE id = ?').get(id), { role: 'admin' })
}
export function updateProject(id, input, actorId) {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  if (!existing) throw new Error('Project not found')
  const value = projectInput(input, projectRecord(existing))
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    db.prepare(`UPDATE projects SET legacy_id = ?, edition = ?, slug = ?, project_group = ?, category = ?, category_label = ?, title = ?, subtitle = ?, summary = ?, tags = ?, highlights = ?, outcomes = ?, tech = ?, members = ?, media = ?, videos = ?, files = ?, accent = ?, sort_order = ?, status = ?, updated_at = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END WHERE id = ?`)
      .run(value.legacy_id, value.edition, value.slug, value.project_group, value.category, value.category_label, value.title, value.subtitle, value.summary, JSON.stringify(value.tags), JSON.stringify(value.highlights), JSON.stringify(value.outcomes), JSON.stringify(value.tech), value.members, JSON.stringify(value.media), JSON.stringify(value.videos), JSON.stringify(value.files), value.accent, value.sort_order, value.status, now, value.status, now, id)
    audit(actorId, 'project.update', 'projects', id, { slug: value.slug, status: value.status })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (String(error.message).includes('UNIQUE')) throw new Error('项目标识已存在')
    throw error
  }
  return projectWithAssets(db.prepare('SELECT * FROM projects WHERE id = ?').get(id), { role: 'admin' })
}
export function offlineProject(id, actorId) {
  db.exec('BEGIN')
  try {
    const result = db.prepare("UPDATE projects SET status = 'offline', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id)
    if (!result.changes) throw new Error('Project not found')
    audit(actorId, 'project.offline', 'projects', id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return projectWithAssets(db.prepare('SELECT * FROM projects WHERE id = ?').get(id), { role: 'admin' })
}

const projectAssetKinds = new Set(['image', 'video', 'file'])
const projectAssetSources = new Set(['upload', 'legacy', 'external'])
const projectAssetAvailability = new Set(['available', 'missing', 'offline'])
const projectImageMimeByExtension = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.gif', 'image/gif'],
])
function hasImageSignature(mime, data) {
  if (mime === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mime === 'image/webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))
  return false
}
function projectAssetInput(input = {}, existing = null) {
  const kind = String(input.kind ?? existing?.kind ?? '').trim()
  const label = String(input.label ?? existing?.label ?? '').trim()
  const sourceType = String(input.source_type ?? input.source ?? existing?.source_type ?? 'upload').trim()
  const availability = String(input.availability ?? existing?.availability ?? 'available').trim()
  const legacyPath = String(input.legacy_path ?? input.legacyPath ?? existing?.legacy_path ?? '').trim()
  const sortOrderValue = input.sort_order ?? input.sortOrder ?? existing?.sort_order ?? 0
  const sortOrder = Number(sortOrderValue)
  const published = input.published === undefined
    ? Boolean(existing?.published ?? false)
    : ['true', '1', 'yes', 'on'].includes(String(input.published).trim().toLowerCase()) || input.published === true || input.published === 1
  if (!projectAssetKinds.has(kind) || !projectAssetSources.has(sourceType) || !projectAssetAvailability.has(availability) ||
      !label || label.length > 160 || legacyPath.length > 500 || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw new Error('Invalid project asset fields')
  }
  if (sourceType === 'legacy' && !legacyPath) throw new Error('Legacy asset path is required')
  if (sourceType === 'legacy' && availability === 'available' && !legacyAssetPathExists(kind, legacyPath)) throw new Error('Legacy asset path does not exist')
  if (sourceType === 'upload' && availability !== 'available' && !existing?.storage_key) throw new Error('Uploaded project asset requires a file')
  if (sourceType === 'external' && (!legacyPath || !/^https:\/\//i.test(legacyPath))) throw new Error('External asset URL is invalid')
  if (availability === 'missing' && published) throw new Error('Missing project asset cannot be published')
  return { kind, label, source_type: sourceType, availability, legacy_path: legacyPath || null, sort_order: sortOrder, published: published ? 1 : 0 }
}
function validateProjectAssetFile(file, kind) {
  if (!file || !Buffer.isBuffer(file.data) || !file.data.length) throw new Error('Project asset file is required')
  if (file.data.length > PROJECT_ASSET_MAX_BYTES) throw new Error('Project asset file is too large')
  const mime = String(file.mime || '').toLowerCase().split(';')[0].trim()
  if (!PROJECT_ASSET_MIME_TYPES[kind]?.has(mime)) throw new Error('Project asset file type is not allowed')
  const filename = path.basename(String(file.filename || '').trim())
  const extension = resourceFileExtension(filename)
  if (!filename || !extension || filename.length > 255 || filename.includes('\0') || !PROJECT_ASSET_EXTENSIONS[kind]?.has(extension)) throw new Error('Project asset filename is invalid')
  if (kind === 'image' && (projectImageMimeByExtension.get(extension) !== mime || !hasImageSignature(mime, file.data))) {
    throw new Error('Project image content does not match its declared type')
  }
  return { data: file.data, mime, filename }
}
function projectByRef(ref) {
  const value = String(ref || '').trim()
  if (!value) return null
  return db.prepare('SELECT * FROM projects WHERE id = ? OR slug = ? LIMIT 1').get(value, value)
}
function listProjectAssetRows(projectId, user = null) {
  const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(projectId)
  if (!project) return null
  const isAdmin = user?.role === 'admin'
  const rows = isAdmin
    ? db.prepare('SELECT * FROM project_assets WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC').all(projectId)
    : project.status === 'published'
      ? db.prepare("SELECT * FROM project_assets WHERE project_id = ? AND published = 1 AND availability = 'available' ORDER BY sort_order ASC, created_at ASC").all(projectId)
      : []
  return rows.map(projectAssetRecord)
}
export function listProjectAssets(projectRef, user = null) {
  const project = projectByRef(projectRef)
  if (!project) return null
  return listProjectAssetRows(project.id, user)
}
export function getProjectAsset(id, user = null) {
  const row = db.prepare('SELECT a.*, p.status AS project_status FROM project_assets a JOIN projects p ON p.id = a.project_id WHERE a.id = ?').get(id)
  if (!row) return null
  if (user?.role !== 'admin' && (row.project_status !== 'published' || !row.published || row.availability !== 'available')) return null
  return projectAssetRecord(row)
}
export function projectAssetFile(id, user = null) {
  const row = db.prepare('SELECT a.*, p.status AS project_status FROM project_assets a JOIN projects p ON p.id = a.project_id WHERE a.id = ?').get(id)
  if (!row || !row.storage_key) return null
  if (user?.role !== 'admin' && (row.project_status !== 'published' || !row.published || row.availability !== 'available')) return null
  const filename = row.filename || path.basename(row.storage_key)
  const filePath = projectStoragePath(row.storage_key)
  if (!filePath || !existsSync(filePath)) return null
  return { path: filePath, filename, mime: row.mime || 'application/octet-stream', size: row.size || 0 }
}
export function addProjectAsset(projectRef, input = {}, actorId) {
  const project = projectByRef(projectRef)
  if (!project) throw new Error('Project not found')
  const file = input.file || null
  const value = projectAssetInput(input)
  if (file) {
    const normalized = validateProjectAssetFile(file, value.kind)
    value.source_type = 'upload'
    value.availability = 'available'
    if (value.published === undefined) value.published = 0
    const id = randomUUID()
    const storageKey = `${id}${resourceFileExtension(normalized.filename)}`
    const destination = projectStoragePath(storageKey)
    const checksum = createHash('sha256').update(normalized.data).digest('hex')
    writeFileSync(destination, normalized.data, { flag: 'wx' })
    const now = new Date().toISOString()
    try {
      db.exec('BEGIN')
      db.prepare(`INSERT INTO project_assets
        (id, project_id, kind, label, source_type, availability, legacy_path, storage_key, filename, size, mime, checksum, sort_order, published, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, project.id, value.kind, value.label, value.source_type, value.availability, value.legacy_path, storageKey, normalized.filename, normalized.data.length, normalized.mime, checksum, value.sort_order, value.published, actorId, now, now)
      audit(actorId, 'project_asset.create', 'project_assets', id, { project_id: project.id, kind: value.kind, size: normalized.data.length })
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      removeProjectStoredFile(storageKey)
      if (String(error.message).includes('UNIQUE')) throw new Error('项目素材已存在')
      throw error
    }
    return projectAssetRecord(db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id))
  }
  if (value.source_type === 'upload' && value.availability === 'available') throw new Error('Uploaded project asset file is required')
  const id = randomUUID()
  const now = new Date().toISOString()
  try {
    db.exec('BEGIN')
    db.prepare(`INSERT INTO project_assets
      (id, project_id, kind, label, source_type, availability, legacy_path, storage_key, filename, size, mime, checksum, sort_order, published, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, ?, ?, ?, ?)`)
      .run(id, project.id, value.kind, value.label, value.source_type, value.availability, value.legacy_path, value.sort_order, value.published, actorId, now, now)
    audit(actorId, 'project_asset.create', 'project_assets', id, { project_id: project.id, kind: value.kind, availability: value.availability })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (String(error.message).includes('UNIQUE')) throw new Error('项目素材已存在')
    throw error
  }
  return projectAssetRecord(db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id))
}
export function updateProjectAsset(id, input = {}, actorId) {
  const existing = db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id)
  if (!existing) throw new Error('Project asset not found')
  const value = projectAssetInput(input, existing)
  if (value.source_type === 'upload' && !existing.storage_key && value.availability === 'available') throw new Error('Uploaded project asset file is required')
  const now = new Date().toISOString()
  try {
    db.exec('BEGIN')
    db.prepare(`UPDATE project_assets SET kind = ?, label = ?, source_type = ?, availability = ?, legacy_path = ?, sort_order = ?, published = ?, updated_at = ? WHERE id = ?`)
      .run(value.kind, value.label, value.source_type, value.availability, value.legacy_path, value.sort_order, value.published, now, id)
    audit(actorId, 'project_asset.update', 'project_assets', id, { project_id: existing.project_id, kind: value.kind, availability: value.availability })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (String(error.message).includes('UNIQUE')) throw new Error('项目素材已存在')
    throw error
  }
  return projectAssetRecord(db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id))
}
export function uploadProjectAssetFile(id, file, actorId) {
  const existing = db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id)
  if (!existing) throw new Error('Project asset not found')
  const normalized = validateProjectAssetFile(file, existing.kind)
  const storageKey = `${id}-${randomUUID()}${resourceFileExtension(normalized.filename)}`
  const destination = projectStoragePath(storageKey)
  const checksum = createHash('sha256').update(normalized.data).digest('hex')
  writeFileSync(destination, normalized.data, { flag: 'wx' })
  const now = new Date().toISOString()
  try {
    db.exec('BEGIN')
    db.prepare(`UPDATE project_assets SET source_type = 'upload', availability = 'available', storage_key = ?, filename = ?, size = ?, mime = ?, checksum = ?, published = 0, updated_at = ? WHERE id = ?`)
      .run(storageKey, normalized.filename, normalized.data.length, normalized.mime, checksum, now, id)
    audit(actorId, 'project_asset.file', 'project_assets', id, { project_id: existing.project_id, size: normalized.data.length })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    removeProjectStoredFile(storageKey)
    throw error
  }
  if (existing.storage_key) removeProjectStoredFile(existing.storage_key)
  return projectAssetRecord(db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id))
}
export function offlineProjectAsset(id, actorId) {
  const existing = db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id)
  if (!existing) throw new Error('Project asset not found')
  const now = new Date().toISOString()
  db.exec('BEGIN')
  try {
    db.prepare("UPDATE project_assets SET availability = 'offline', published = 0, updated_at = ? WHERE id = ?").run(now, id)
    audit(actorId, 'project_asset.offline', 'project_assets', id, { project_id: existing.project_id })
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return projectAssetRecord(db.prepare('SELECT * FROM project_assets WHERE id = ?').get(id))
}
export function uploadAllowed(user, purpose) {
  requireApproved(user)
  if (!['resource', 'submission'].includes(purpose) || (purpose === 'resource' && user.role !== 'admin')) throw new Error('没有该上传权限')
  const quota = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM uploads WHERE owner_id = ? AND entity_id IS NULL').get(user.id)
  if (quota.count >= 30 || quota.bytes >= 200 * 1024 * 1024) throw new Error('待提交附件过多，请先发布或提交已有附件')
}
export function saveUpload(file, user, purpose) {
  db.prepare('INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, NULL, ?)')
    .run(file.id, user.id, purpose, file.name, file.mime, file.size, new Date().toISOString())
  return attachmentDetails([file.id])[0]
}
export function fileAccess(id, user) {
  const file = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)
  if (!file) return null
  let allowed = false
  if (!file.entity_id) allowed = approved(user) && file.owner_id === user.id
  else if (file.purpose === 'resource') allowed = !!getResource(file.entity_id, user)
  else {
    const submission = db.prepare('SELECT author_id FROM submissions WHERE id = ?').get(file.entity_id)
    allowed = approved(user) && submission && (staff(user) || submission.author_id === user.id)
  }
  return allowed ? file : false
}
export function listAssignments(user) {
  requireApproved(user)
  const rows = db.prepare('SELECT a.*, u.name AS author_name FROM assignments a JOIN users u ON u.id = a.author_id ORDER BY a.created_at DESC').all()
  return rows.filter(a => staff(user) || ((a.team === 'all' || hasApprovedMembership(user.id, a.team)) &&
    (a.target_grade === 'all' || a.target_grade === user.grade ||
      (a.target_grade.startsWith('!') && a.target_grade.slice(1) !== user.grade))))
}
export function addAssignment({ title, body, team, dueAt, targetGrade = 'all' }, user) {
  if (!staff(user)) throw new Error('仅老师和管理员可发布作业')
  title = String(title || '').trim(); body = String(body || '').trim()
  if (!title || title.length > 120 || !body || body.length > 30000 || !['all', ...teams].includes(team)) throw new Error('请填写作业标题、要求及适用团队')
  if (targetGrade !== 'all' && (typeof targetGrade !== 'string' || !/^!?\d{2}级$/.test(targetGrade))) throw new Error('年级范围无效')
  if (dueAt && (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now())) throw new Error('截止时间必须在未来')
  const id = randomUUID()
  db.prepare('INSERT INTO assignments (id, title, body, team, due_at, author_id, created_at, target_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, title, body, team, dueAt ? new Date(dueAt).toISOString() : null, user.id, new Date().toISOString(), targetGrade)
  return { id }
}
export function submitAssignment(assignmentId, { body, attachments = [] }, user) {
  requireApproved(user)
  const assignment = listAssignments(user).find(a => a.id === assignmentId)
  if (!assignment) throw new Error('作业不存在或无权提交')
  if (assignment.due_at && Date.parse(assignment.due_at) < Date.now()) throw new Error('作业已截止')
  body = String(body || '').trim()
  if ((!body && !attachments.length) || body.length > 30000) throw new Error('请填写提交说明或上传附件')
  validateAttachments(attachments, user, 'submission')
  const id = randomUUID()
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO submissions VALUES (?, ?, ?, ?, ?, ?)').run(id, assignmentId, user.id, body, JSON.stringify(attachments), new Date().toISOString())
    bindAttachments(attachments, id)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { id }
}
export function listSubmissions(user) {
  requireApproved(user)
  const rows = staff(user)
    ? db.prepare('SELECT s.*, u.name AS author_name, u.role AS author_role, u.student_id, u.team, a.title AS assignment_title FROM submissions s JOIN users u ON u.id = s.author_id JOIN assignments a ON a.id = s.assignment_id ORDER BY s.created_at DESC').all()
    : db.prepare('SELECT s.*, u.name AS author_name, u.role AS author_role, u.student_id, u.team, a.title AS assignment_title FROM submissions s JOIN users u ON u.id = s.author_id JOIN assignments a ON a.id = s.assignment_id WHERE s.author_id = ? ORDER BY s.created_at DESC').all(user.id)
  return rows.map(row => ({ ...row, attachments: attachmentDetails(JSON.parse(row.attachments)) }))
}

export function discardUpload(id, user) {
  requireApproved(user)
  const file = db.prepare('SELECT * FROM uploads WHERE id = ? AND owner_id = ? AND entity_id IS NULL').get(id, user.id)
  if (!file) return false
  db.prepare('DELETE FROM uploads WHERE id = ?').run(id)
  return file
}
