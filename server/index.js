import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as platform from './platform.js'
import { siteContent } from './content.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distRoot = path.resolve(__dirname, '..', 'dist')
const hasClientBuild = existsSync(path.join(distRoot, 'index.html'))
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
const REQUEST_MAX_BYTES = platform.RESOURCE_FILE_MAX_BYTES + 2 * 1024 * 1024
const CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'"

function applySecurityHeaders(res, req) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
  if (process.env.LAB_REQUIRE_HTTPS === '1' && req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000')
  }
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
])

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'Content-Type': contentType })
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    chunks.push(chunk)
    size += chunk.length
    if (size > 65536) throw new Error('Request too large')
  }

  if (chunks.length === 0) {
    return {}
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) {
    return {}
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function readRawBody(req, maxBytes = REQUEST_MAX_BYTES) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) throw new Error('Request too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readMultipart(req) {
  const contentType = String(req.headers['content-type'] || '')
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  if (!boundaryMatch) throw new Error('Invalid multipart request')
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2].trim()}`)
  const raw = await readRawBody(req)
  const fields = {}
  let file = null
  let cursor = raw.indexOf(boundary)
  while (cursor !== -1) {
    const start = cursor + boundary.length
    if (raw.slice(start, start + 2).toString() === '--') break
    const partStart = raw.slice(start, start + 2).toString() === '\r\n' ? start + 2 : start
    const next = raw.indexOf(boundary, partStart)
    if (next === -1) break
    const part = raw.slice(partStart, next - (raw.slice(next - 2, next).toString() === '\r\n' ? 2 : 0))
    const separator = part.indexOf(Buffer.from('\r\n\r\n'))
    if (separator === -1) throw new Error('Invalid multipart part')
    const headerText = part.slice(0, separator).toString('utf8')
    const data = part.slice(separator + 4)
    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headerText)
    if (!disposition) { cursor = next; continue }
    const name = disposition[1]
    if (disposition[2] !== undefined) {
      const mime = /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() || ''
      file = { filename: disposition[2], mime, size: data.length, data }
    } else {
      fields[name] = data.toString('utf8')
    }
    cursor = next
  }
  return { fields, file }
}

async function tryServeStatic(res, pathname) {
  if (!hasClientBuild) {
    return false
  }

  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return false
  }
  const safePath = decodedPath === '/' ? '/index.html' : decodedPath.replace(/\\/g, '/')
  const candidate = path.resolve(distRoot, `.${safePath}`)
  if (candidate !== distRoot && !candidate.startsWith(`${distRoot}${path.sep}`)) {
    return false
  }

  if (existsSync(candidate) && !candidate.endsWith(path.sep)) {
    const ext = path.extname(candidate).toLowerCase()
    const contentType = mimeTypes.get(ext) || 'application/octet-stream'
    const content = await fs.readFile(candidate)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
    return true
  }

  const indexPath = path.join(distRoot, 'index.html')
  const content = readFileSync(indexPath)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(content)
  return true
}

const failedLogins = new Map()
const applicationAttempts = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const LOGIN_RATE_LIMIT = 10
const APPLICATION_RATE_LIMIT = 5
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res, req)
  try {
  if (!req.url) {
    sendJson(res, 400, { ok: false, message: 'Missing request url.' })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname.startsWith('/api')) {
    if (process.env.LAB_REQUIRE_HTTPS === '1' && req.headers['x-forwarded-proto'] !== 'https' &&
        pathname !== '/api/health' && pathname !== '/api/site' &&
        (pathname !== '/api/teams' && !/^\/api\/teams\/[^/]+$/.test(pathname))) {
      sendJson(res, 403, { message: 'Use the HTTPS site for accounts and resources' }); return
    }
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin
      const isJson = req.headers['content-type']?.startsWith('application/json')
      const isMultipart = req.headers['content-type']?.startsWith('multipart/form-data')
      const isResourceFile = /^\/api\/resources\/[^/]+\/file$/.test(pathname)
      const isProjectAssetUpload = /^\/api\/admin\/projects\/[^/]+\/assets$/.test(pathname) || /^\/api\/admin\/project-assets\/[^/]+\/file$/.test(pathname)
      const validBody = isJson || (isMultipart && (isResourceFile || isProjectAssetUpload)) || (isResourceFile && req.method === 'DELETE')
      if ((origin && new URL(origin).host !== req.headers.host) || !validBody) {
        sendJson(res, 403, { message: 'Invalid request origin or content type' }); return
      }
    }
    const token = /(?:^|;\s*)lab_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1]
    const user = platform.currentUser(token)
    const admin = user?.role === 'admin'
    if (req.method === 'GET' && pathname === '/api/me') {
      sendJson(res, 200, { data: user }); return
    }
    if (req.method === 'POST' && pathname === '/api/apply') {
      const key = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown')
      const attempt = applicationAttempts.get(key) || { count: 0, since: Date.now() }
      if (Date.now() - attempt.since > RATE_LIMIT_WINDOW_MS) { attempt.count = 0; attempt.since = Date.now() }
      if (attempt.count >= APPLICATION_RATE_LIMIT) { sendJson(res, 429, { message: 'Too many applications; retry later' }); return }
      attempt.count++; applicationAttempts.set(key, attempt)
      sendJson(res, 201, { data: platform.apply(await readBody(req) || {}) }); return
    }
    if (req.method === 'POST' && pathname === '/api/login') {
      const key = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown')
      const attempt = failedLogins.get(key) || { count: 0, since: Date.now() }
      if (Date.now() - attempt.since > RATE_LIMIT_WINDOW_MS) { attempt.count = 0; attempt.since = Date.now() }
      if (attempt.count >= LOGIN_RATE_LIMIT) { sendJson(res, 429, { message: 'Too many attempts; retry later' }); return }
      const body = await readBody(req) || {}
      const result = platform.login(body.account ?? body.email, body.password)
      if (!result) {
        attempt.count++; failedLogins.set(key, attempt)
        sendJson(res, 401, { message: '账号或密码不正确' }); return
      }
      failedLogins.delete(key)
      const secure = process.env.LAB_REQUIRE_HTTPS === '1' || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
      res.setHeader('Set-Cookie', `lab_session=${result.token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`)
      sendJson(res, 200, { data: result.user }); return
    }
    if (req.method === 'POST' && pathname === '/api/logout') {
      platform.logout(token)
      res.setHeader('Set-Cookie', 'lab_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0')
      sendJson(res, 200, { ok: true }); return
    }
    if (req.method === 'POST' && pathname === '/api/password') {
      if (!user) { sendJson(res, 401, { message: 'Login required' }); return }
      const body = await readBody(req) || {}
      platform.changePassword(user.id, body.oldPassword, body.newPassword)
      res.setHeader('Set-Cookie', 'lab_session=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0')
      sendJson(res, 200, { ok: true }); return
    }
    if (req.method === 'POST' && pathname === '/api/apply-team') {
      if (!user) { sendJson(res, 401, { message: 'Login required' }); return }
      const body = await readBody(req) || {}
      sendJson(res, 201, { data: platform.applyTeam(user.id, body.team, body.statement) }); return
    }
    if (req.method === 'GET' && pathname === '/api/projects') {
      sendJson(res, 200, { data: platform.listProjects(user) }); return
    }
    if (req.method === 'GET' && pathname === '/api/teams') {
      sendJson(res, 200, { data: platform.listTeams() }); return
    }
    if (req.method === 'GET' && pathname === '/api/announcements') {
      sendJson(res, 200, { data: platform.listAnnouncements() }); return
    }
    if (req.method === 'GET' && /^\/api\/announcements\/[^/]+$/.test(pathname)) {
      const ref = decodeURIComponent(pathname.slice('/api/announcements/'.length))
      const item = platform.getAnnouncement(ref)
      sendJson(res, item ? 200 : 404, item ? { data: item } : { message: 'Announcement not found' }); return
    }
    if (req.method === 'GET' && /^\/api\/teams\/[^/]+$/.test(pathname)) {
      const item = platform.getTeam(decodeURIComponent(pathname.slice('/api/teams/'.length)))
      sendJson(res, item ? 200 : 404, item ? { data: item } : { message: 'Team not found' }); return
    }
    if (req.method === 'GET' && /^\/api\/projects\/[^/]+$/.test(pathname)) {
      const item = platform.getProject(decodeURIComponent(pathname.slice('/api/projects/'.length)), user)
      sendJson(res, item ? 200 : 404, item ? { data: item } : { message: 'Project not found' }); return
    }
    if (req.method === 'GET' && /^\/api\/projects\/[^/]+\/assets$/.test(pathname)) {
      const projectRef = decodeURIComponent(pathname.slice('/api/projects/'.length, -'/assets'.length))
      const project = platform.getProject(projectRef, user)
      if (!project) { sendJson(res, 404, { message: 'Project not found' }); return }
      sendJson(res, 200, { data: platform.listProjectAssets(projectRef, user) || [] }); return
    }
    if (req.method === 'GET' && /^\/api\/project-assets\/[^/]+\/file$/.test(pathname)) {
      const assetId = decodeURIComponent(pathname.slice('/api/project-assets/'.length, -'/file'.length))
      const file = platform.projectAssetFile(assetId, user)
      if (!file) { sendJson(res, 404, { message: 'Project asset file not found' }); return }
      const content = await fs.readFile(file.path)
      res.writeHead(200, {
        'Content-Type': file.mime || 'application/octet-stream',
        'Content-Length': content.length,
        'Content-Disposition': file.mime?.startsWith('image/')
          ? `inline; filename*=UTF-8''${encodeURIComponent(file.filename || 'project-asset')}`
          : `attachment; filename*=UTF-8''${encodeURIComponent(file.filename || 'project-asset')}`,
        'Cache-Control': user?.role === 'admin' ? 'private, no-store' : 'public, max-age=300',
      })
      res.end(content); return
    }
    if (req.method === 'GET' && pathname === '/api/resources') {
      sendJson(res, 200, { data: platform.listResources(user) }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/resources') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.listAdminResources() }); return
    }
    if (req.method === 'GET' && pathname.startsWith('/api/resources/')) {
      if (/^\/api\/resources\/[^/]+\/file$/.test(pathname)) {
        const resourceId = decodeURIComponent(pathname.slice('/api/resources/'.length, -'/file'.length))
        const file = platform.getResourceFile(resourceId, user)
        if (file === false) { sendJson(res, 403, { message: 'Team membership required' }); return }
        if (!file) { sendJson(res, 404, { message: 'Resource file not found' }); return }
        res.writeHead(200, {
          'Content-Type': file.mime || 'application/octet-stream',
          'Content-Length': file.data.length,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename || 'resource-file')}`,
          'Cache-Control': 'private, no-store',
          'X-Content-SHA256': file.checksum || '',
        })
        res.end(file.data)
        return
      }
      const item = platform.getResource(pathname.slice('/api/resources/'.length), user)
      sendJson(res, item === false ? 403 : item ? 200 : 404, item === false ? { message: 'Team membership required' } : item ? { data: item } : { message: 'Resource not found' }); return
    }
    if (req.method === 'POST' && pathname === '/api/resources') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 201, { data: platform.addResource(await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'POST' && /^\/api\/resources\/[^/]+\/file$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const resourceId = decodeURIComponent(pathname.slice('/api/resources/'.length, -'/file'.length))
      const multipart = await readMultipart(req)
      if (!multipart.file) { sendJson(res, 400, { message: 'Attachment is required' }); return }
      const result = platform.saveResourceFile(resourceId, multipart.file, user.id)
      sendJson(res, 200, { data: result }); return
    }
    if (req.method === 'DELETE' && /^\/api\/resources\/[^/]+\/file$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const resourceId = decodeURIComponent(pathname.slice('/api/resources/'.length, -'/file'.length))
      sendJson(res, 200, { data: platform.removeResourceFile(resourceId, user.id) }); return
    }
    if (req.method === 'PATCH' && /^\/api\/resources\/[^/]+$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      platform.updateResource(pathname.slice('/api/resources/'.length), await readBody(req) || {}, user.id)
      sendJson(res, 200, { ok: true }); return
    }
    if (req.method === 'PATCH' && /^\/api\/resources\/[^/]+\/status$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const resourceId = decodeURIComponent(pathname.slice('/api/resources/'.length, -'/status'.length))
      const body = await readBody(req) || {}
      if (Object.keys(body).some(key => key !== 'status')) { sendJson(res, 400, { message: 'Invalid resource status request' }); return }
      sendJson(res, 200, { data: platform.setResourceStatus(resourceId, body.status, user.id) }); return
    }
    if (req.method === 'DELETE' && /^\/api\/resources\/[^/]+$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      platform.deleteResource(pathname.slice('/api/resources/'.length), user.id)
      sendJson(res, 200, { ok: true }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/projects') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.listAdminProjects() }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/teams') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.listTeams({ includeDisabled: true }) }); return
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/teams\/[^/]+$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.updateTeam(decodeURIComponent(pathname.slice('/api/admin/teams/'.length)), await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'POST' && pathname === '/api/admin/projects') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 201, { data: platform.addProject(await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/projects\/[^/]+$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.updateProject(decodeURIComponent(pathname.slice('/api/admin/projects/'.length)), await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/projects\/[^/]+\/offline$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.offlineProject(decodeURIComponent(pathname.slice('/api/admin/projects/'.length, -'/offline'.length)), user.id) }); return
    }
    if (req.method === 'GET' && /^\/api\/admin\/projects\/[^/]+\/assets$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const projectRef = decodeURIComponent(pathname.slice('/api/admin/projects/'.length, -'/assets'.length))
      const assets = platform.listProjectAssets(projectRef, user)
      if (assets === null) { sendJson(res, 404, { message: 'Project not found' }); return }
      sendJson(res, 200, { data: assets }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/projects\/[^/]+\/assets$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const projectRef = decodeURIComponent(pathname.slice('/api/admin/projects/'.length, -'/assets'.length))
      const isMultipart = req.headers['content-type']?.startsWith('multipart/form-data')
      const payload = isMultipart ? await readMultipart(req) : { fields: await readBody(req) || {}, file: null }
      const input = isMultipart ? { ...payload.fields, file: payload.file } : payload.fields
      sendJson(res, 201, { data: platform.addProjectAsset(projectRef, input, user.id) }); return
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/project-assets\/[^/]+$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const assetId = decodeURIComponent(pathname.slice('/api/admin/project-assets/'.length))
      sendJson(res, 200, { data: platform.updateProjectAsset(assetId, await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/project-assets\/[^/]+\/file$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const assetId = decodeURIComponent(pathname.slice('/api/admin/project-assets/'.length, -'/file'.length))
      const multipart = await readMultipart(req)
      if (!multipart.file) { sendJson(res, 400, { message: 'Project asset file is required' }); return }
      sendJson(res, 200, { data: platform.uploadProjectAssetFile(assetId, multipart.file, user.id) }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/project-assets\/[^/]+\/offline$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const assetId = decodeURIComponent(pathname.slice('/api/admin/project-assets/'.length, -'/offline'.length))
      sendJson(res, 200, { data: platform.offlineProjectAsset(assetId, user.id) }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/applications') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.applications() }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/announcements') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.adminAnnouncements() }); return
    }
    if (req.method === 'POST' && pathname === '/api/admin/announcements') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 201, { data: platform.createAnnouncement(await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'PATCH' && /^\/api\/admin\/announcements\/[^/]+$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const id = decodeURIComponent(pathname.slice('/api/admin/announcements/'.length))
      sendJson(res, 200, { data: platform.updateAnnouncement(id, await readBody(req) || {}, user.id) }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/announcements\/[^/]+\/offline$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const id = decodeURIComponent(pathname.slice('/api/admin/announcements/'.length, -'/offline'.length))
      sendJson(res, 200, { data: platform.offlineAnnouncement(id, user.id) }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/members') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.members() }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/memberships') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.memberships() }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/memberships\/[^/]+\/(revoke|restore)$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const action = pathname.includes('/revoke') ? 'revokeMembership' : 'restoreMembership'
      const id = decodeURIComponent(pathname.slice('/api/admin/memberships/'.length).replace(/\/(revoke|restore)$/, ''))
      sendJson(res, 200, { data: platform[action](id, user.id) }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/audit') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.auditLogs() }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/site') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.getSiteContent(siteContent) }); return
    }
    if (req.method === 'PATCH' && pathname === '/api/admin/site') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const body = await readBody(req) || {}
      sendJson(res, 200, { data: platform.updateSiteSection(body.section, body.value, user.id, siteContent) }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/members\/[^/]+\/status$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const body = await readBody(req) || {}
      platform.setMemberActive(pathname.split('/')[4], body.isActive, user.id)
      sendJson(res, 200, { ok: true }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/members\/[^/]+\/reset-password$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      const body = await readBody(req) || {}
      if (Object.keys(body).some(key => key !== 'password')) { sendJson(res, 400, { message: 'Invalid request fields' }); return }
      const id = decodeURIComponent(pathname.slice('/api/admin/members/'.length, -'/reset-password'.length))
      sendJson(res, 200, platform.resetMemberPassword(id, body.password, user.id)); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/applications\/[^/]+\/review$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      platform.review(pathname.split('/')[4], (await readBody(req) || {}).status, user.id)
      sendJson(res, 200, { ok: true }); return
    }
    if (req.method === 'GET' && pathname === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        message: 'Server is running.',
        timestamp: new Date().toISOString(),
      })
      return
    }

    if (req.method === 'GET' && pathname === '/api/site') {
      sendJson(res, 200, { ok: true, data: platform.getSiteContent(siteContent) })
      return
    }

    if (req.method === 'POST' && pathname === '/api/recruitment') {
      sendJson(res, 410, { message: 'Use /portal?mode=apply to submit a membership application' })
      return
    }

    sendJson(res, 404, { ok: false, message: 'API route not found.' })
    return
  }

  if (await tryServeStatic(res, pathname)) {
    return
  }

  sendText(res, 404, 'Not found')
  } catch (error) {
    console.error('Request failed:', error)
    if (!res.headersSent) sendJson(res, error.message === 'Request too large' ? 413 : 400, { message: error.message || 'Invalid request' })
    else res.end()
  }
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请直接使用已经运行的服务，或先停止占用该端口的进程。`)
    console.error(`PowerShell：Get-NetTCPConnection -LocalPort ${port} -State Listen`)
    process.exitCode = 1
    return
  }

  console.error('服务启动失败：', error)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`服务启动成功，监听地址：http://${host}:${port}`)
})
