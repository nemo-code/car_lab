import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { catalog } from './catalog.js'
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto'

export const teams = ['software', 'hardware', 'simulation']
const dbPath = process.env.LAB_DB_PATH || path.resolve('data/lab.sqlite')
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, student_id TEXT UNIQUE, username TEXT COLLATE NOCASE UNIQUE, name TEXT NOT NULL, grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member');
  CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, statement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, team TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, visibility TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`)
// 旧库迁移：旧 users 表只有 (id, email, name, password_hash, team, status, role)，没有 student_id 列
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(column => column.name)
if (!userColumns.includes('student_id')) {
  db.exec(`BEGIN;
    ALTER TABLE users RENAME TO users_old;
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, student_id TEXT UNIQUE, username TEXT UNIQUE, name TEXT NOT NULL, grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member');
    INSERT INTO users (id, email, name, password_hash, team, status, role)
      SELECT id, email, name, password_hash, team, status, role FROM users_old;
    DROP TABLE users_old;
    COMMIT;`)
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_username_nocase ON users(username COLLATE NOCASE)')
// Preserve existing accounts, applications and sessions when adding explicit roles.
db.exec("UPDATE users SET role = 'student' WHERE role = 'member'")
const resourceColumns = db.prepare('PRAGMA table_info(resources)').all().map(c => c.name)
if (!resourceColumns.includes('attachments')) db.exec("ALTER TABLE resources ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
db.exec(`CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, purpose TEXT NOT NULL, name TEXT NOT NULL,
  mime TEXT NOT NULL, size INTEGER NOT NULL, entity_id TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, team TEXT NOT NULL,
  due_at TEXT, author_id TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL,
  attachments TEXT NOT NULL, created_at TEXT NOT NULL);`)
const assignmentColumns = db.prepare('PRAGMA table_info(assignments)').all().map(c => c.name)
if (!assignmentColumns.includes('target_grade')) db.exec("ALTER TABLE assignments ADD COLUMN target_grade TEXT NOT NULL DEFAULT 'all'")
export const storageRoot = path.resolve(path.dirname(dbPath), 'uploads')
mkdirSync(storageRoot, { recursive: true })
const hashToken = token => createHash('sha256').update(token).digest('hex')
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const expected = Buffer.from(hash, 'hex')
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected)
}
export function createAdmin(email, name, password) {
  if (!email || password.length < 12) throw new Error('Admin email and password of 12+ characters required')
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new Error('Account exists')
  db.prepare('INSERT INTO users (id, email, name, password_hash, team, status, role) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), email, name, hashPassword(password), 'software', 'approved', 'admin')
}
export function apply({ studentId, email, name, username, password, team, statement, role = 'student' }) {
  studentId = String(studentId || '').trim()
  name = String(name || '').trim()
  username = String(username || '').trim()
  statement = String(statement || '').trim()
  email = String(email || '').trim().toLowerCase()
  if (!['student', 'teacher'].includes(role)) throw new Error('请选择学生或老师身份')
  if (role === 'teacher' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error('请输入有效的老师邮箱')
  if (role === 'student' && !/^\d{11}$/.test(studentId)) throw new Error('学号应为 11 位数字')
  if (username && !/^\p{L}[\p{L}\p{N}_-]{1,23}$/u.test(username)) throw new Error('用户名须为 2-24 位，以字母或汉字开头，可包含数字、_、-')
  if (!name || name.length > 80 || typeof password !== 'string' || password.length < 6 || password.length > 128 ||
      !teams.includes(team) || statement.length > 1000) throw new Error('Invalid application fields')
  if (username && username.length > 30) throw new Error('用户名不能超过 30 个字符')
  if (role === 'teacher' && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new Error('邮箱已被注册')
  if (role === 'student' && db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId)) throw new Error('学号已被注册')
  if (username && db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new Error('用户名已被使用')
  const grade = role === 'student' ? studentId.slice(0, 2) + '级' : null
  const userId = randomUUID(), id = randomUUID()
  const passwordHash = hashPassword(password)
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO users (id, email, student_id, username, name, grade, password_hash, team, status, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, role === 'teacher' ? email : null, role === 'student' ? studentId : null, username || null, name, grade, passwordHash, team, 'pending', role)
    db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, statement, 'pending', new Date().toISOString(), null)
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
  return { id: user.id, email: user.email, studentId: user.student_id, username: user.username, name: user.name, grade: user.grade, team: user.team, status: user.status, role: user.role }
}
export function login(account, password) {
  account = String(account || '').trim()
  if (/^\d+$/.test(account) && !/^\d{11}$/.test(account)) throw new Error('学号应为 11 位数字')
  let user = db.prepare('SELECT * FROM users WHERE student_id = ?').get(account)
  if (!user) user = db.prepare('SELECT * FROM users WHERE username = ?').get(account)
  if (!user) user = db.prepare('SELECT * FROM users WHERE email = ?').get(account.toLowerCase())
  if (!user || typeof password !== 'string' || password.length > 128 || !verifyPassword(password, user.password_hash)) return null
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hashToken(token), user.id, Date.now() + 7 * 86400000)
  return { token, user: publicUser(user) }
}
export function currentUser(token) {
  if (!token) return null
  const user = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').get(hashToken(token), Date.now())
  return user ? publicUser(user) : null
}
export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}
export function changePassword(userId, oldPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) throw new Error('Invalid new password')
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId)
  if (!user || !verifyPassword(String(oldPassword || ''), user.password_hash)) throw new Error('Invalid old password')
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}
export function applications() {
  return db.prepare('SELECT a.id, a.statement, a.status, a.created_at, a.reviewed_at, u.name, u.email, u.student_id, u.username, u.grade, u.team, u.role FROM applications a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC').all()
}
export function review(id, status) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Invalid review status')
  db.exec('BEGIN')
  try {
    const result = db.prepare("UPDATE applications SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").run(status, new Date().toISOString(), id)
    if (!result.changes) throw new Error('Application already processed or missing')
    db.prepare('UPDATE users SET status = ? WHERE id = (SELECT user_id FROM applications WHERE id = ?)').run(status, id)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function approved(user) { return !!user && user.status === 'approved' }
export function staff(user) { return approved(user) && ['admin', 'teacher'].includes(user.role) }
function requireApproved(user) { if (!approved(user)) throw new Error('请先登录并等待管理员审核通过') }
export function listResources() {
  return [...catalog.map(({ body, attachments, ...summary }) => summary),
    ...db.prepare('SELECT id, team, title, summary, visibility, created_at FROM resources ORDER BY created_at DESC').all()]
}
export function getResource(id, user) {
  const bundled = catalog.find(item => item.id === id)
  if (bundled) return bundled
  const item = db.prepare('SELECT * FROM resources WHERE id = ?').get(id)
  if (!item) return null
  if (item.visibility !== 'public' && !(staff(user) || (approved(user) && user.team === item.team))) return false
  return { ...item, attachments: attachmentDetails(JSON.parse(item.attachments)) }
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
export function addResource({ team, title, summary, visibility, body, attachments = [] }, user) {
  if (user?.role !== 'admin' || !approved(user)) throw new Error('仅管理员可发布资源')
  title = String(title || '').trim(); summary = String(summary || '').trim(); body = String(body || '').trim()
  if (!teams.includes(team) || !['public', 'team'].includes(visibility) || !title || title.length > 120 ||
      !summary || summary.length > 500 || (!body && !attachments.length) || body.length > 30000) throw new Error('请填写有效的标题、摘要和正文或附件')
  validateAttachments(attachments, user, 'resource')
  const id = randomUUID()
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO resources (id, team, title, summary, visibility, body, created_at, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, team, title, summary, visibility, body, new Date().toISOString(), JSON.stringify(attachments))
    bindAttachments(attachments, id)
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return { id }
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
  return rows.filter(a => staff(user) || ((a.team === 'all' || a.team === user.team) &&
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
