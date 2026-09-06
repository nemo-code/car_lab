import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import {
  contactSubmissions,
  recruitmentSubmissions,
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

function setCorsHeaders(headers = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  }
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, setCorsHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  }))
  res.end(payload)
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, setCorsHeaders({ 'Content-Type': contentType }))
  res.end(body)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
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
    res.writeHead(200, setCorsHeaders({ 'Content-Type': contentType }))
    res.end(content)
    return true
  }

  const indexPath = path.join(distRoot, 'index.html')
  const content = readFileSync(indexPath)
  res.writeHead(200, setCorsHeaders({ 'Content-Type': 'text/html; charset=utf-8' }))
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

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { ok: false, message: 'Missing request url.' })
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, setCorsHeaders())
    res.end()
    return
  }

  if (pathname.startsWith('/api')) {
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
      const body = await readBody(req)
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, message: 'Invalid JSON body.' })
        return
      }

      const entry = createSubmission({
        type: 'recruitment',
        teamName: String(body.teamName || 'Unknown Team').trim(),
        intent: String(body.intent || '').trim(),
        contact: String(body.contact || '').trim(),
        note: String(body.note || '').trim(),
      })

      if (!entry.intent) {
        sendJson(res, 400, { ok: false, message: 'Recruitment intent is required.' })
        return
      }

      recruitmentSubmissions.push(entry)
      sendJson(res, 201, { ok: true, data: entry })
      return
    }

    sendJson(res, 404, { ok: false, message: 'API route not found.' })
    return
  }

  if (await tryServeStatic(res, pathname)) {
    return
  }

  sendText(res, 404, 'Not found')
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
