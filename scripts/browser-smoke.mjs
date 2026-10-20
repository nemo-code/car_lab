import { mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const baseUrl = String(process.env.BROWSER_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '')
const chrome = process.env.BROWSER_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'chromium'
)

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', () => resolve()).on('error', reject))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitForJson(port) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json`)
      if (response.ok) return response.json()
    } catch {}
    await sleep(100)
  }
  throw new Error('Chrome DevTools endpoint did not start')
}

async function smoke() {
  const port = await freePort()
  const profile = await mkdtemp(path.join(os.tmpdir(), 'car-lab-browser-'))
  const browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-first-run',
    `--user-data-dir=${profile}`, '--window-size=1440,1000', `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] })
  try {
    const target = (await waitForJson(port)).find(item => item.type === 'page')
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome page target is unavailable')
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let nextId = 0
    const events = []
    const httpErrors = []
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') events.push({ type: 'exception', text: message.params.exceptionDetails?.text || '' })
      if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level) &&
        !/^Failed to load resource: the server responded with a \d+/.test(message.params.entry.text || '')) {
        events.push({ type: message.params.entry.level, text: message.params.entry.text || '' })
      }
      if (message.method === 'Network.loadingFailed' && !message.params.canceled && message.params.errorText !== 'net::ERR_ABORTED') {
        events.push({ type: 'network', text: message.params.errorText || '' })
      }
      if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
        httpErrors.push({ status: message.params.response.status, url: message.params.response.url })
      }
    })
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        const handler = event => {
          const message = JSON.parse(event.data)
          if (message.id !== id) return
          socket.removeEventListener('message', handler)
          message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
        }
        socket.addEventListener('message', handler)
        socket.send(JSON.stringify({ id, method, params }))
      })
    }
    await call('Runtime.enable')
    await call('Log.enable')
    await call('Network.enable')
    const results = []
    const routes = [
      '/', '/about', '/teams/software', '/teams/hardware', '/teams/simulation',
      '/projects', '/resources', '/services', '/announcements', '/portal?mode=apply', '/member', '/admin',
      '/team', '/Team', '/contact', '/Contact', '/About', '/Projects', '/Resources', '/Services',
    ]
    for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      await call('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width < 600 })
      for (const route of routes) {
        events.length = 0
        await call('Page.navigate', { url: `${baseUrl}${route}` })
        await call('Runtime.evaluate', { expression: 'new Promise(resolve => setTimeout(resolve, 700))', awaitPromise: true })
        const result = await call('Runtime.evaluate', {
          expression: `JSON.stringify({ route: location.pathname + location.search, width: window.innerWidth, documentWidth: document.documentElement.scrollWidth, text: document.body.innerText.slice(0, 240) })`,
          returnByValue: true,
        })
        const state = JSON.parse(result.result.value)
        const legacyRedirects = {
          '/member': '/portal',
          '/admin': '/portal',
          '/team': '/teams/software',
          '/Team': '/teams/software',
          '/contact': '/portal',
          '/Contact': '/portal',
        }
        const expectedPath = legacyRedirects[route] || route.split('?')[0]
        const routeMismatch = !state.route.startsWith(expectedPath)
        results.push({ viewport: viewport.name, ...state, routeMismatch, overflow: state.documentWidth > state.width, events: [...events] })
      }
    }
    socket.close()
    const failed = results.filter(result => result.routeMismatch || result.overflow || result.events.length ||
      !result.text.trim() || /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|无法访问此网站|This site can.t be reached/i.test(result.text))
    const relevantHttpErrors = httpErrors.filter(error => !/\/favicon\.ico(?:\?|$)/i.test(error.url))
    if (relevantHttpErrors.length) throw new Error(`Browser smoke HTTP errors: ${JSON.stringify(relevantHttpErrors)}`)
    if (failed.length) throw new Error(`Browser smoke failed: ${JSON.stringify(failed)}`)
    return { baseUrl, results, pass: true }
  } finally {
    browser.kill('SIGTERM')
    await new Promise(resolve => browser.once('close', resolve))
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

try {
  process.stdout.write(`${JSON.stringify(await smoke())}\n`)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
