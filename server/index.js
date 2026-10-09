import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import * as platform from './platform.js'
import {
  contactSubmissions,
  siteContent,
} from './content.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distRoot = path.resolve(__dirname, '..', 'dist')
const hasClientBuild = existsSync(path.join(distRoot, 'index.html'))
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'

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

async function tryServeStatic(res, pathname) {
  if (!hasClientBuild) {
    return false
  }

  const safePath = pathname === '/' ? '/index.html' : pathname.replace(/\\/g, '/')
  const candidate = path.resolve(distRoot, `.${safePath}`)
  if (!candidate.startsWith(distRoot)) {
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

function createSubmission(entry) {
  return {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    ...entry,
  }
}

const failedLogins = new Map()
const server = http.createServer(async (req, res) => {
  try {
  if (!req.url) {
    sendJson(res, 400, { ok: false, message: 'Missing request url.' })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname.startsWith('/api')) {
    if (process.env.LAB_REQUIRE_HTTPS === '1' && req.headers['x-forwarded-proto'] !== 'https' &&
        pathname !== '/api/health' && pathname !== '/api/site') {
      sendJson(res, 403, { message: 'Use the HTTPS site for accounts and resources' }); return
    }
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin
      if ((origin && new URL(origin).host !== req.headers.host) || !req.headers['content-type']?.startsWith('application/json')) {
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
      sendJson(res, 201, { data: platform.apply(await readBody(req) || {}) }); return
    }
    if (req.method === 'POST' && pathname === '/api/login') {
      const key = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown')
      const attempt = failedLogins.get(key) || { count: 0, since: Date.now() }
      if (Date.now() - attempt.since > 900000) { attempt.count = 0; attempt.since = Date.now() }
      if (attempt.count >= 10) { sendJson(res, 429, { message: 'Too many attempts; retry later' }); return }
      const body = await readBody(req) || {}
      const result = platform.login(body.email, body.password)
      if (!result) {
        attempt.count++; failedLogins.set(key, attempt)
        sendJson(res, 401, { message: 'Invalid email or password' }); return
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
    if (req.method === 'GET' && pathname === '/api/resources') {
      sendJson(res, 200, { data: platform.listResources() }); return
    }
    if (req.method === 'GET' && pathname.startsWith('/api/resources/')) {
      const item = platform.getResource(pathname.slice('/api/resources/'.length), user)
      sendJson(res, item === false ? 403 : item ? 200 : 404, item === false ? { message: 'Team membership required' } : item ? { data: item } : { message: 'Resource not found' }); return
    }
    if (req.method === 'POST' && pathname === '/api/resources') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 201, { data: platform.addResource(await readBody(req) || {}) }); return
    }
    if (req.method === 'GET' && pathname === '/api/admin/applications') {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      sendJson(res, 200, { data: platform.applications() }); return
    }
    if (req.method === 'POST' && /^\/api\/admin\/applications\/[^/]+\/review$/.test(pathname)) {
      if (!admin) { sendJson(res, 403, { message: 'Administrator required' }); return }
      platform.review(pathname.split('/')[4], (await readBody(req) || {}).status)
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
      sendJson(res, 200, { ok: true, data: siteContent })
      return
    }

    if (req.method === 'POST' && pathname === '/api/contact') {
      const body = await readBody(req)
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, message: 'Invalid JSON body.' })
        return
      }

      const entry = createSubmission({
        type: 'contact',
        name: String(body.name || '').trim(),
        email: String(body.email || '').trim(),
        message: String(body.message || '').trim(),
      })

      if (!entry.name || !entry.email || !entry.message) {
        sendJson(res, 400, { ok: false, message: 'Name, email, and message are required.' })
        return
      }

      contactSubmissions.push(entry)
      sendJson(res, 201, { ok: true, data: entry })
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
