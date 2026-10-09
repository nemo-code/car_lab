import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto'

export const teams = ['software', 'hardware', 'simulation']
const dbPath = process.env.LAB_DB_PATH || path.resolve('data/lab.sqlite')
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, student_id TEXT UNIQUE, username TEXT UNIQUE, name TEXT NOT NULL, grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member');
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
export function apply({ studentId, name, username, password, team, statement }) {
  studentId = String(studentId || '').trim()
  name = String(name || '').trim()
  username = String(username || '').trim()
  statement = String(statement || '').trim()
  if (!/^\d{11}$/.test(studentId)) throw new Error('学号应为 11 位数字')
  if (!name || name.length > 80 || typeof password !== 'string' || password.length < 10 || password.length > 128 ||
      !teams.includes(team) || !statement || statement.length > 1000) throw new Error('Invalid application fields')
  if (username && username.length > 30) throw new Error('用户名不能超过 30 个字符')
  if (db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId)) throw new Error('学号已被注册')
  if (username && db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw new Error('用户名已被使用')
  const grade = studentId.slice(0, 2) + '级'
  const userId = randomUUID(), id = randomUUID()
  const passwordHash = hashPassword(password)
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO users (id, email, student_id, username, name, grade, password_hash, team, status, role) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(userId, studentId, username || null, name, grade, passwordHash, team, 'pending', 'member')
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
  if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) throw new Error('Invalid new password')
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId)
  if (!user || !verifyPassword(String(oldPassword || ''), user.password_hash)) throw new Error('Invalid old password')
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userId)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}
export function applications() {
  return db.prepare('SELECT a.id, a.statement, a.status, a.created_at, a.reviewed_at, u.name, u.email, u.student_id, u.username, u.grade, u.team FROM applications a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC').all()
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
export function listResources() {
  return db.prepare('SELECT id, team, title, summary, visibility, created_at FROM resources ORDER BY created_at DESC').all()
}
export function getResource(id, user) {
  const item = db.prepare('SELECT * FROM resources WHERE id = ?').get(id)
  if (!item) return null
  if (item.visibility !== 'public' && !(user?.role === 'admin' || (user?.status === 'approved' && user?.team === item.team))) return false
  return item
}
export function addResource({ team, title, summary, visibility, body }) {
  title = String(title || '').trim(); summary = String(summary || '').trim(); body = String(body || '').trim()
  if (!teams.includes(team) || !['public', 'team'].includes(visibility) || !title || title.length > 120 ||
      !summary || summary.length > 500 || !body || body.length > 30000) throw new Error('Invalid resource fields')
  const id = randomUUID()
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, team, title, summary, visibility, body, new Date().toISOString())
  return { id }
}
