import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomUUID } from 'node:crypto'

export const teams = ['software', 'hardware', 'simulation']
const dbPath = process.env.LAB_DB_PATH || path.resolve('data/lab.sqlite')
mkdirSync(path.dirname(dbPath), { recursive: true })
const db = new DatabaseSync(dbPath)
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', role TEXT NOT NULL DEFAULT 'member');
  CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, statement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, reviewed_at TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, team TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, visibility TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`)
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
  db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, 'software', 'approved', 'admin')")
    .run(randomUUID(), email, name, hashPassword(password))
}
export function apply({ email, name, password, team, statement }) {
  email = String(email || '').trim().toLowerCase()
  name = String(name || '').trim()
  statement = String(statement || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 80 ||
      typeof password !== 'string' || password.length < 10 || password.length > 128 ||
      !teams.includes(team) || !statement || statement.length > 1000) throw new Error('Invalid application fields')
  const userId = randomUUID(), id = randomUUID()
  const passwordHash = hashPassword(password)
  db.exec('BEGIN')
  try {
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, email, name, passwordHash, team, 'pending', 'member')
    db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, statement, 'pending', new Date().toISOString(), null)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    if (error.message.includes('UNIQUE')) throw new Error('Email already registered')
    throw error
  }
  return { id, status: 'pending' }
}
export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, team: user.team, status: user.status, role: user.role }
}
export function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase())
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
  return db.prepare('SELECT a.id, a.statement, a.status, a.created_at, a.reviewed_at, u.name, u.email, u.team FROM applications a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC').all()
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
