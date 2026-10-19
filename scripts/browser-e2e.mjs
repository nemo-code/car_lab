import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const chrome = process.env.BROWSER_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : 'chromium'
)
const viteBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
const adminEmail = 'e2e-admin@example.invalid'
const adminPassword = 'e2e-admin-password-2026'
const studentPassword = 'e2e-student-password-2026'
const backend = String(process.env.E2E_BACKEND || 'node').trim().toLowerCase()
const hooksDir = path.join(root, 'pocketbase', 'pb_hooks')
const sourceMigrationsDir = path.join(root, 'pocketbase', 'pb_migrations')
const publicDir = path.join(root, 'public')

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).on('error', reject))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function waitForHttp(url, label, timeout = 15000) {
  const deadline = Date.now() + timeout
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      lastError = `${response.status} ${response.statusText}`
    } catch (error) {
      lastError = error.message
    }
    await sleep(100)
  }
  throw new Error(`${label} did not become ready: ${lastError}`)
}

async function jsonRequest(base, pathname, options = {}, token = '') {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${payload.message || payload.error || 'request failed'}`)
  return payload
}

async function startPocketBase(tempRoot, port) {
  const binary = process.env.POCKETBASE_BINARY
  if (!binary) throw new Error('Set POCKETBASE_BINARY to the verified PocketBase 0.40.5 executable')
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()
  if (!version.includes('0.40.5')) throw new Error(`PocketBase 0.40.5 is required; found ${version}`)
  const dataDir = path.join(tempRoot, 'pb_data')
  const migrationsDir = path.join(tempRoot, 'pb_migrations')
  await cp(sourceMigrationsDir, migrationsDir, { recursive: true })
  const superEmail = `e2e-super-${Date.now()}@example.invalid`
  const superPassword = `E2ESuper-${Date.now()}-Strong-Pass`
  execFileSync(binary, ['superuser', 'create', superEmail, superPassword, '--dir', dataDir, '--hooksDir', hooksDir, '--migrationsDir', migrationsDir, '--automigrate=true'], { stdio: 'ignore', timeout: 30000 })
  const base = `http://127.0.0.1:${port}`
  const pbProcess = startProcess(binary, ['serve', '--http', `127.0.0.1:${port}`, '--dir', dataDir, '--hooksDir', hooksDir, '--migrationsDir', migrationsDir, '--publicDir', publicDir, '--automigrate=true', '--hooksWatch=false'], globalThis.process.env)
  await waitForHttp(`${base}/api/health`, 'temporary PocketBase API')
  const auth = await jsonRequest(base, '/api/collections/_superusers/auth-with-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: superEmail, password: superPassword }),
  })
  const token = auth.token
  if (!token) throw new Error('Temporary PocketBase superuser authentication failed')
  const seedEnv = { ...globalThis.process.env, POCKETBASE_URL: base, POCKETBASE_ADMIN_TOKEN: token }
  for (const script of ['scripts/seed-pocketbase-site.mjs', 'scripts/seed-pocketbase-projects.mjs']) {
    execFileSync(globalThis.process.execPath, [script, '--apply'], { cwd: root, env: seedEnv, stdio: 'ignore', timeout: 45000 })
  }
  const teams = await jsonRequest(base, '/api/collections/teams/records?filter=code%20%3D%20%22software%22&perPage=1', {}, token)
  const team = teams.items?.[0]
  if (!team?.id) throw new Error('Seeded software team is unavailable')
  const adminStamp = String(Date.now()).slice(-9)
  const admin = await jsonRequest(base, '/api/collections/users/records', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword, passwordConfirm: adminPassword, student_id: `29${adminStamp}`, username: `e2eadmin${adminStamp.slice(-6)}`, name: 'E2E Admin', grade: '29级', primary_team: team.id, status: 'approved', role: 'admin', is_active: true }),
  }, token)
  return { base, process: pbProcess, token, dataDir, adminId: admin.id }
}

function startProcess(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk.toString() })
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  child.output = () => ({ stdout: stdout.slice(-3000), stderr: stderr.slice(-3000) })
  return child
}

async function stopProcess(child) {
  if (!child) return
  try {
    if (child.exitCode !== null) return
    child.kill('SIGTERM')
    await Promise.race([
      new Promise(resolve => child.once('close', resolve)),
      sleep(3000).then(() => { if (child.exitCode === null) child.kill('SIGKILL') }),
    ])
  } finally {
    // Chrome helpers can inherit these pipes after the browser has exited.
    child.stdout?.destroy()
    child.stderr?.destroy()
  }
}

async function waitForJson(port) {
  const response = await waitForHttp(`http://127.0.0.1:${port}/json`, 'Chrome DevTools endpoint')
  return response.json()
}

function cdpSession(socket) {
  let nextId = 0
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const handler = event => {
      const message = JSON.parse(event.data)
      if (message.id !== id) return
      socket.removeEventListener('message', handler)
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
      else resolve(message.result)
    }
    socket.addEventListener('message', handler)
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed')
    return result.result?.value
  }
  return { call, evaluate }
}

async function pageState(cdp) {
  return JSON.parse(await cdp.evaluate(`JSON.stringify({
    path: location.pathname + location.search,
    width: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    text: document.body.innerText.slice(0, 4000),
  })`))
}

async function waitFor(cdp, predicate, label, timeout = 12000) {
  const deadline = Date.now() + timeout
  let state
  while (Date.now() < deadline) {
    state = await pageState(cdp)
    if (predicate(state)) return state
    await sleep(120)
  }
  throw new Error(`${label} was not observed. Last page state: ${JSON.stringify(state)}`)
}

async function waitForEnabled(cdp, selector, label, timeout = 12000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const enabled = await cdp.evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); return Boolean(element && !element.disabled) })()`)
    if (enabled) return
    await sleep(120)
  }
  throw new Error(`${label} did not become enabled`)
}

async function waitForTeamStatus(cdp, teamCode, enabled) {
  const status = enabled ? '已启用' : '已停用'
  await waitFor(cdp, state => state.text.includes(`${status} · ${teamCode}`), `team ${teamCode} ${status}`)
  await waitForEnabled(cdp, '.lab-form-wide .lab-primary', `team ${teamCode} save completion`)
}

async function assertNoOverflow(cdp, label) {
  const state = await pageState(cdp)
  if (state.documentWidth > state.width || state.bodyWidth > state.width) {
    throw new Error(`${label} overflows at ${state.width}px: ${JSON.stringify({ documentWidth: state.documentWidth, bodyWidth: state.bodyWidth })}`)
  }
  return state
}

function fillExpression(label, value) {
  return `(() => {
    const wanted = ${JSON.stringify(label)}
    const node = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(wanted))
    const element = node?.querySelector('input, select, textarea')
    if (!element) throw new Error('Form field not found: ' + wanted)
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
    if (element instanceof HTMLSelectElement && element.value !== ${JSON.stringify(value)}) {
      throw new Error('Select option unavailable for ' + wanted + ': requested=' + ${JSON.stringify(value)} + '; available=' + [...element.options].map(option => option.value).join(', '))
    }
    return element.value
  })()`
}

function attachFileExpression(label, filename, mime, contents) {
  return `(() => {
    const wanted = ${JSON.stringify(label)}
    const node = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(wanted))
    const input = node?.querySelector('input[type="file"]')
    if (!input) throw new Error('File field not found: ' + wanted)
    const transfer = new DataTransfer()
    transfer.items.add(new File([${JSON.stringify(contents)}], ${JSON.stringify(filename)}, { type: ${JSON.stringify(mime)} }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return input.files[0]?.name || ''
  })()`
}

function attachBase64FileExpression(label, filename, mime, base64) {
  return `(() => {
    const wanted = ${JSON.stringify(label)}
    const node = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(wanted))
    const input = node?.querySelector('input[type="file"]')
    if (!input) throw new Error('File field not found: ' + wanted)
    const binary = atob(${JSON.stringify(base64)})
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], ${JSON.stringify(filename)}, { type: ${JSON.stringify(mime)} }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return input.files[0]?.name || ''
  })()`
}

function failNextResourceUploadExpression() {
  return `(() => {
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send
    let shouldFail = true
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this.__carLabResourceUpload = String(url).includes('/resources/') && String(url).endsWith('/file')
      return originalOpen.call(this, method, url, ...args)
    }
    XMLHttpRequest.prototype.send = function(body) {
      if (shouldFail && this.__carLabResourceUpload) {
        shouldFail = false
        XMLHttpRequest.prototype.open = originalOpen
        XMLHttpRequest.prototype.send = originalSend
        queueMicrotask(() => this.onerror?.())
        return
      }
      return originalSend.call(this, body)
    }
    return true
  })()`
}

function clickButtonExpression(text, scopeText = '') {
  return `(() => {
    const wanted = ${JSON.stringify(text)}
    const scope = ${JSON.stringify(scopeText)}
    let buttons = [...document.querySelectorAll('button')].filter(item => item.textContent.trim() === wanted)
    if (scope) {
      const container = [...document.querySelectorAll('.lab-row, .lab-resource-item')].find(item => item.textContent.includes(scope))
      buttons = container ? [...container.querySelectorAll('button')].filter(item => item.textContent.trim() === wanted) : []
    }
    const button = buttons[0]
    if (!button) { const auth = (() => { try { return JSON.parse(localStorage.getItem('car_lab_pocketbase_auth_v1') || 'null') } catch { return null } })(); throw new Error('Button not found: ' + wanted + (scope ? ' in ' + scope : '') + '; path=' + location.pathname + '; authRole=' + (auth?.record?.role || 'none') + '; available=' + [...document.querySelectorAll('button')].map(item => item.textContent.trim()).filter(Boolean).slice(0, 50).join(' | ') + '; text=' + document.body.innerText.slice(0, 1200) + '; requests=' + JSON.stringify(performance.getEntriesByType('resource').map(item => item.name).filter(name => name.includes('/api/')).slice(-20))) }
    button.click()
    return true
  })()`
}

function submitFormExpression(selector) {
  return `(() => { const form = document.querySelector(${JSON.stringify(selector)}); if (!form) throw new Error('Form not found: ' + ${JSON.stringify(selector)}); form.requestSubmit(); return true })()`
}

function clickCheckboxExpression(label) {
  return `(() => { const wanted = ${JSON.stringify(label)}; const node = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith(wanted)); const input = node?.querySelector('input[type="checkbox"]'); if (!input) throw new Error('Checkbox not found: ' + wanted); if (!input.checked) input.click(); return input.checked })()`
}

function clickProjectDetailExpression(title) {
  return `(() => { const title = ${JSON.stringify(title)}; const card = [...document.querySelectorAll('.project-card')].find(item => item.textContent.includes(title)); const button = [...(card?.querySelectorAll('button') || [])].find(item => item.textContent.includes('查看项目内容')); if (!button) throw new Error('Project detail button not found: ' + title); button.click(); return true })()`
}

export async function runFlow() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'car-lab-browser-e2e-'))
  const dbPath = path.join(tempRoot, 'lab.sqlite')
  const serverPort = await freePort()
  const vitePort = await freePort()
  const chromePort = await freePort()
  const browserProfile = await mkdtemp(path.join(os.tmpdir(), 'car-lab-chrome-e2e-'))
  let server
  let pocketBase
  let vite
  let browser
  let backendBase
  let socket
  try {
    if (backend === 'node') {
      const env = { ...process.env, LAB_DB_PATH: dbPath, HOST: '127.0.0.1', PORT: String(serverPort) }
      const bootstrap = spawnSync(process.execPath, ['server/bootstrap-admin.js', adminEmail, 'E2E Admin'], { cwd: root, env, input: `${adminPassword}\n`, encoding: 'utf8' })
      if (bootstrap.status !== 0) throw new Error(`Temporary administrator setup failed: ${bootstrap.stderr || bootstrap.stdout}`)
      server = startProcess(process.execPath, ['server/index.js'], env)
      backendBase = `http://127.0.0.1:${serverPort}`
      await waitForHttp(`${backendBase}/api/health`, 'temporary Node API')
    } else if (backend === 'pocketbase') {
      pocketBase = await startPocketBase(tempRoot, serverPort)
      backendBase = pocketBase.base
    } else {
      throw new Error(`Unsupported E2E_BACKEND: ${backend}`)
    }
    vite = startProcess(viteBin, ['--host', '127.0.0.1', '--port', String(vitePort)], {
      ...process.env,
      VITE_PLATFORM_BACKEND: backend,
      VITE_POCKETBASE_URL: backend === 'pocketbase' ? '/api' : '',
      VITE_DEV_API_TARGET: backendBase,
    })
    browser = startProcess(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
      '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-first-run',
      `--user-data-dir=${browserProfile}`, '--window-size=390,844', `--remote-debugging-port=${chromePort}`, 'about:blank',
    ], process.env)
    await waitForHttp(`http://127.0.0.1:${vitePort}/`, 'temporary Vite app')
    const target = (await waitForJson(chromePort)).find(item => item.type === 'page')
    if (!target?.webSocketDebuggerUrl) throw new Error('Chrome page target is unavailable')
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    const cdp = cdpSession(socket)
    const browserEvents = []
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') browserEvents.push({ type: 'exception', text: message.params.exceptionDetails?.text || '' })
      if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) browserEvents.push({ type: message.params.entry.level, text: message.params.entry.text || '' })
    })
    await cdp.call('Runtime.enable')
    await cdp.call('Log.enable')
    await cdp.call('Page.enable')
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

    const baseUrl = `http://127.0.0.1:${vitePort}`
    const stamp = String(Date.now()).slice(-9)
    const student = {
      name: 'E2E Student',
      studentId: `25${stamp}`,
      username: `e2e${stamp.slice(-8)}`,
    }
    const resourceTitle = `E2E 团队资源 ${stamp}`
    const secondResourceTitle = `E2E 第二团队资源 ${stamp}`
    const announcementSlug = `e2e-announcement-${stamp}`
    const announcementTitle = `E2E 公告 ${stamp}`

    const navigate = async route => {
      await cdp.call('Page.navigate', { url: `${baseUrl}${route}` })
      await waitFor(cdp, state => state.path === route || state.path.startsWith(route.split('?')[0]), `route ${route}`)
      if (route.split('?')[0] === '/admin') {
        await waitFor(cdp, state => ['申请审核', '成员管理', '团队内容', '项目成果', '操作日志'].every(label => state.text.includes(label)), 'administrator modules rendered')
      }
      await sleep(300)
    }
    const spaNavigate = async (route, selector) => {
      const before = await cdp.evaluate('performance.timeOrigin')
      await cdp.evaluate(`(() => { const link = document.querySelector(${JSON.stringify(selector)}); if (!link) throw new Error('Navigation link not found'); link.click(); return true })()`)
      await waitFor(cdp, state => state.path === route, `SPA route ${route}`)
      const after = await cdp.evaluate('performance.timeOrigin')
      if (before !== after) throw new Error(`Navigation to ${route} reloaded the document`)
      await sleep(250)
    }
    const fill = (label, value) => cdp.evaluate(fillExpression(label, value))
    const attachFile = (label, filename, mime, contents) => cdp.evaluate(attachFileExpression(label, filename, mime, contents))
    const clickButton = (text, scope) => cdp.evaluate(clickButtonExpression(text, scope))
    const clickProjectDetail = title => cdp.evaluate(clickProjectDetailExpression(title))
    const submitForm = selector => cdp.evaluate(submitFormExpression(selector))
    const enableCheckbox = label => cdp.evaluate(clickCheckboxExpression(label))
    const submitVisibleForm = () => cdp.evaluate(`(() => {
      const form = [...document.querySelectorAll('form')].find(item => getComputedStyle(item).display !== 'none')
      if (!form) throw new Error('Visible form not found')
      form.requestSubmit()
      return true
    })()`)

    await navigate('/portal?mode=apply')
    await waitFor(cdp, state => state.text.includes('申请加入'), 'application form')
    await fill('姓名', student.name)
    await fill('学号', student.studentId)
    await fill('用户名（选填）', student.username)
    await fill('想加入的团队', 'software')
    await fill('申请说明（选填）', 'E2E browser flow')
    await fill('设置登录密码', studentPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('申请已提交。请登录查看审核进度。'), 'application success')
    await assertNoOverflow(cdp, 'application form')

    await fill('学号或用户名', student.studentId)
    await fill('密码', studentPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.path === '/member' && state.text.includes('申请等待审核'), 'student member login')
    await assertNoOverflow(cdp, 'pending member page')
    await clickButton('退出登录')
    await waitFor(cdp, state => state.path === '/portal', 'student logout')

    await navigate('/portal?mode=login')
    await fill('学号或用户名', adminEmail)
    await fill('密码', adminPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.path === '/admin' && state.text.includes('管理员工作台') && state.text.includes('申请审核'), 'administrator login')
    await waitFor(cdp, state => state.text.includes('团队内容') && state.text.includes('软件团队'), 'administrator team controls loaded')
    await assertNoOverflow(cdp, 'admin applications page')

    await clickButton('成员管理')
    await waitFor(cdp, state => state.text.includes('成员管理') && state.text.includes('团队成员关系'), 'member management tab')
    await fill('团队', 'hardware')
    await sleep(120)
    const filteredOutMember = await cdp.evaluate(`(() => [...document.querySelectorAll('.admin-table')].find(table => [...table.querySelectorAll('th')].some(cell => cell.textContent.trim() === '账号'))?.querySelector('tbody')?.innerText.includes(${JSON.stringify(student.name)}))()`)
    if (filteredOutMember) {
      const debug = await cdp.evaluate(`JSON.stringify({ selected: [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith('团队'))?.querySelector('select')?.value, table: [...document.querySelectorAll('.admin-table')].find(table => [...table.querySelectorAll('th')].some(cell => cell.textContent.trim() === '账号'))?.querySelector('tbody')?.innerText || '' })`)
      throw new Error(`member team filter did not exclude the software member from hardware results: ${debug}`)
    }
    await fill('团队', 'software')
    await sleep(120)
    const filteredInMember = await cdp.evaluate(`(() => [...document.querySelectorAll('.admin-table')].find(table => [...table.querySelectorAll('th')].some(cell => cell.textContent.trim() === '账号'))?.querySelector('tbody')?.innerText.includes(${JSON.stringify(student.name)}))()`)
    if (!filteredInMember) throw new Error('member team filter did not restore the software member')
    await assertNoOverflow(cdp, 'member team filter tab')

    const teamCaption = `E2E 团队说明 ${stamp}`
    await clickButton('团队内容')
    await waitFor(cdp, state => state.text.includes('团队内容') && state.text.includes('软件团队'), 'team content management tab')
    await clickButton('编辑', '软件团队')
    await fill('导航短句', teamCaption)
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('团队内容已保存。'), 'team content update')
    await navigate('/teams/software')
    await waitFor(cdp, state => state.text.includes(teamCaption), 'public team content update')
    await assertNoOverflow(cdp, 'public team content page')

    await navigate('/admin')
    await clickButton('团队内容')
    await waitFor(cdp, state => state.text.includes('团队内容'), 'team content management for disable check')
    for (const teamCode of ['software', 'hardware', 'simulation']) {
      await clickButton('编辑', teamCode)
      await cdp.evaluate(`(() => { const label = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith('对外显示')); const input = label?.querySelector('input[type="checkbox"]'); if (!input) throw new Error('Team enabled checkbox not found'); if (input.checked) input.click(); return !input.checked })()`)
      await submitVisibleForm()
      await waitFor(cdp, state => state.text.includes('团队内容已保存。'), `disable team ${teamCode}`)
      await waitForTeamStatus(cdp, teamCode, false)
    }
    await spaNavigate('/', 'a.site-brand')
    const publicTeamNames = await cdp.evaluate(`JSON.stringify([...document.querySelectorAll('.team-nav-panel a')].map(link => link.textContent.trim()))`)
    if (JSON.parse(publicTeamNames).length) throw new Error(`Disabled teams remained in public navigation: ${publicTeamNames}`)
    await navigate('/portal?mode=apply')
    await waitFor(cdp, state => state.text.includes('管理员后台'), 'admin portal before empty-team check')
    await clickButton('退出登录')
    await waitFor(cdp, state => state.text.includes('目前没有开放申请的团队'), 'empty enabled team application state')
    const applyState = await cdp.evaluate(`JSON.stringify({ buttons: [...document.querySelectorAll('.lab-portal form button')].map(button => ({ text: button.textContent.trim(), disabled: button.disabled })), options: [...document.querySelectorAll('.lab-portal select')].map(select => [...select.options].map(option => option.value)) })`)
    if (!JSON.parse(applyState).buttons.some(button => button.text === '提交申请' && button.disabled)) throw new Error(`Application remained available without an enabled team: ${applyState}`)
    await navigate('/portal?mode=login')
    await fill('学号或用户名', adminEmail)
    await fill('密码', adminPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.path === '/admin' && state.text.includes('管理员工作台'), 'administrator login before restoring teams')
    await waitFor(cdp, state => state.text.includes('团队内容'), 'administrator team controls loaded before restore')
    await clickButton('团队内容')
    for (const teamCode of ['software', 'hardware', 'simulation']) {
      await clickButton('编辑', teamCode)
      await cdp.evaluate(`(() => { const label = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith('对外显示')); const input = label?.querySelector('input[type="checkbox"]'); if (!input) throw new Error('Team enabled checkbox not found'); if (!input.checked) input.click(); return input.checked })()`)
      await submitVisibleForm()
      await waitFor(cdp, state => state.text.includes('团队内容已保存。'), `restore team ${teamCode}`)
      await waitForTeamStatus(cdp, teamCode, true)
    }
    if (backend === 'pocketbase') {
      const publicTeams = await jsonRequest(pocketBase.base, '/api/collections/teams/records?filter=enabled%20%3D%20true&perPage=200&sort=sort')
      const enabledCodes = (publicTeams.items || []).map(team => team.code)
      const missingTeams = ['software', 'hardware', 'simulation'].filter(code => !enabledCodes.includes(code))
      if (missingTeams.length) throw new Error(`Enabled teams missing from public PocketBase API after restoration: ${missingTeams.join(', ')}; available=${enabledCodes.join(', ')}`)
    }
    const homeTitle = `E2E 官网标题 ${stamp}`
    await navigate('/admin')
    await clickButton('官网内容')
    await waitFor(cdp, state => state.text.includes('官网内容') && state.text.includes('区块内容'), 'site content management tab')
    await fill('内容区块', 'home')
    const homePayload = await cdp.evaluate(`(() => {
      const label = [...document.querySelectorAll('label')].find(item => item.textContent.trim().startsWith('区块内容'))
      if (!label) throw new Error('Site content field not found')
      return JSON.parse(label.querySelector('textarea').value)
    })()`)
    homePayload.hero.title = homeTitle
    await fill('区块内容', JSON.stringify(homePayload, null, 2))
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('官网内容已保存。'), 'site content update')
    await spaNavigate('/', 'a.site-brand')
    await waitFor(cdp, state => state.text.includes(homeTitle), 'public home content update')
    await assertNoOverflow(cdp, 'public home page after content update')

    const projectSlug = `e2e-project-${stamp}`
    const projectTitle = `E2E 项目成果 ${stamp}`
    const editedProjectTitle = `E2E 项目成果已更新 ${stamp}`
    await navigate('/admin')
    await clickButton('项目成果')
    await waitFor(cdp, state => state.text.includes('项目成果') && state.text.includes('新建项目'), 'project management tab')
    await clickButton('新建项目')
    await fill('项目标识（slug）', projectSlug)
    await fill('成果批次', 'e2e')
    await fill('项目小组', 'E2E 项目组')
    await fill('项目分类', 'software')
    await fill('分类标签', '软件系统')
    await fill('标题', projectTitle)
    await fill('副标题', '浏览器端项目维护验收')
    await fill('项目简介', '通过管理员工作台创建的临时 E2E 项目。')
    await fill('图片路径', 'assets/software-1.jpg\nassets/software-2.jpg')
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('项目已发布。') && state.text.includes(projectTitle), 'project creation')
    await navigate('/projects')
    await waitFor(cdp, state => state.text.includes(projectTitle), 'public project publication')
    await assertNoOverflow(cdp, 'public project page')

    await navigate('/admin')
    await clickButton('项目成果')
    await waitFor(cdp, state => state.text.includes(projectTitle), 'project after public read')
    await clickButton('编辑', projectTitle)
    await waitFor(cdp, state => state.text.includes('受控项目素材'), 'controlled project asset editor')
    const projectAssetFixtures = await Promise.all([
      { kind: 'video', label: 'E2E 演示视频', filename: 'project-demo.mp4', mime: 'video/mp4' },
      { kind: 'file', label: 'E2E 成果报告', filename: 'project-report.pdf', mime: 'application/pdf' },
    ].map(async fixture => ({ ...fixture, bytes: await readFile(path.join(root, 'scripts', 'fixtures', fixture.filename)) })))
    const addProjectAsset = async ({ kind, label, filename, mime, bytes }) => {
      await fill('素材类型', kind)
      await fill('素材名称', label)
      await fill('来源', 'upload')
      await cdp.evaluate(attachBase64FileExpression('上传文件', filename, mime, bytes.toString('base64')))
      await submitForm('.project-asset-form')
      await waitFor(cdp, state => state.text.includes('项目素材已添加。') && state.text.includes(label), `create ${kind} project asset`)
      await waitForEnabled(cdp, '.project-asset-form .lab-primary', `create ${kind} project asset completion`)
      await clickButton('编辑', label)
      await enableCheckbox('对外发布')
      await submitForm('.project-asset-form')
      await waitFor(cdp, state => state.text.includes('项目素材已更新。') && state.text.includes(label) && state.text.includes(path.extname(filename)), `publish ${kind} project asset`)
      await waitForEnabled(cdp, '.project-asset-form .lab-primary', `publish ${kind} project asset completion`)
    }
    for (const fixture of projectAssetFixtures) await addProjectAsset(fixture)
    await navigate('/projects')
    await waitFor(cdp, state => state.text.includes(projectTitle), 'project with published assets')
    await clickProjectDetail(projectTitle)
    await waitFor(cdp, state => state.text.includes('E2E 演示视频') && state.text.includes('E2E 成果报告'), 'public project video and file links')
    const projectAssetLinks = await cdp.evaluate(`[...document.querySelectorAll('.project-dialog-assets a')].map(link => ({ text: link.textContent, href: link.href }))`)
    for (const fixture of projectAssetFixtures) {
      const link = projectAssetLinks.find(item => item.text.includes(fixture.label) && item.href)
      if (!link) throw new Error(`Published ${fixture.kind} link missing from project detail`)
      fixture.url = link.href
      const response = await fetch(fixture.url)
      if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0] !== fixture.mime) {
        throw new Error(`Anonymous ${fixture.kind} access returned ${response.status} with ${response.headers.get('content-type')}`)
      }
      if (!Buffer.from(await response.arrayBuffer()).equals(fixture.bytes)) throw new Error(`Published ${fixture.kind} file bytes changed`)
    }
    const videoUrl = projectAssetFixtures.find(fixture => fixture.kind === 'video').url
    const videoMetadata = await cdp.evaluate(`new Promise((resolve, reject) => {
      const video = document.createElement('video')
      const timeout = setTimeout(() => finish(new Error('Uploaded video did not decode')), 8000)
      const finish = error => {
        clearTimeout(timeout)
        const metadata = { duration: video.duration, width: video.videoWidth, height: video.videoHeight }
        video.onloadeddata = null
        video.onerror = null
        video.removeAttribute('src')
        video.load()
        error ? reject(error) : resolve(metadata)
      }
      video.onloadeddata = () => finish()
      video.onerror = () => finish(new Error('Uploaded video failed to load'))
      video.preload = 'auto'
      video.src = ${JSON.stringify(videoUrl)}
      video.load()
    })`)
    if (!(videoMetadata.duration > 0 && videoMetadata.width > 0 && videoMetadata.height > 0)) throw new Error('Uploaded video has no decodable frames')
    const projectGalleryCount = await cdp.evaluate(`document.querySelectorAll('.project-media-gallery img').length`)
    if (projectGalleryCount < 1) throw new Error('Additional project images were not shown in the detail gallery')
    await navigate('/admin')
    await clickButton('项目成果')
    await clickButton('编辑', projectTitle)
    await waitFor(cdp, state => state.text.includes('E2E 成果报告'), 'project file asset in admin')
    await cdp.evaluate('window.confirm = () => true')
    for (const fixture of projectAssetFixtures) {
      await clickButton('下线', fixture.label)
      await waitFor(cdp, state => state.text.includes('项目素材已下线。'), `${fixture.kind} project asset offline`)
      const deadline = Date.now() + 12000
      let status
      do {
        const response = await fetch(fixture.url)
        status = response.status
        await response.arrayBuffer()
        if (status === 404) break
        await sleep(120)
      } while (Date.now() < deadline)
      if (status !== 404) throw new Error(`Offline ${fixture.kind} URL returned ${status}`)
    }
    await navigate('/projects')
    await waitFor(cdp, state => state.text.includes(projectTitle), 'public project after asset offline')
    await clickProjectDetail(projectTitle)
    await waitFor(cdp, state => projectAssetFixtures.every(fixture => !state.text.includes(fixture.label)), 'offline video and file assets hidden')
    await cdp.evaluate("document.querySelector('.project-dialog-close')?.click()")

    await navigate('/admin')
    await clickButton('项目成果')
    await waitFor(cdp, state => state.text.includes(projectTitle), 'project before metadata edit')
    await clickButton('编辑', projectTitle)
    await fill('标题', editedProjectTitle)
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('项目已更新。') && state.text.includes(editedProjectTitle), 'project update')
    await navigate('/projects')
    await waitFor(cdp, state => state.text.includes(editedProjectTitle), 'public project update')
    await navigate('/admin')
    await clickButton('项目成果')
    await waitFor(cdp, state => state.text.includes(editedProjectTitle), 'updated project in admin')
    await cdp.evaluate('window.confirm = () => true')
    await clickButton('下线', editedProjectTitle)
    await waitFor(cdp, state => state.text.includes('项目已下线。'), 'project offline')
    await navigate('/projects')
    await waitFor(cdp, state => !state.text.includes('正在载入项目成果…'), 'public project list after offline')
    const offlineProjectVisible = await cdp.evaluate(`document.body.innerText.includes(${JSON.stringify(editedProjectTitle)})`)
    if (offlineProjectVisible) throw new Error('Offline project remained visible on the public page')
    await assertNoOverflow(cdp, 'public project page after offline')

    await navigate('/admin')
    await clickButton('新闻公告')
    await waitFor(cdp, state => state.text.includes('新闻公告') && state.text.includes('新建公告'), 'announcement management tab')
    await fill('标识（slug）', announcementSlug)
    await fill('标题', announcementTitle)
    await fill('状态', 'published')
    await fill('摘要', 'E2E announcement summary')
    await fill('正文', 'E2E announcement body')
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('公告已创建。') && state.text.includes(announcementTitle), 'announcement publication')
    await assertNoOverflow(cdp, 'announcement management page')
    await navigate('/announcements')
    await waitFor(cdp, state => state.text.includes(announcementTitle), 'public announcement list')
    await assertNoOverflow(cdp, 'public announcement list')
    await navigate(`/announcements/${announcementSlug}`)
    await waitFor(cdp, state => state.text.includes('E2E announcement body'), 'public announcement detail')
    await assertNoOverflow(cdp, 'public announcement detail')
    await navigate('/admin')
    await waitFor(cdp, state => state.path === '/admin' && state.text.includes('管理员工作台') && state.text.includes('申请审核'), 'return to administrator workspace')
    await clickButton('新闻公告')
    await waitFor(cdp, state => state.text.includes(announcementTitle), 'announcement after public read')
    await cdp.evaluate('window.confirm = () => true')
    await clickButton('下线', announcementTitle)
    await waitFor(cdp, state => state.text.includes('公告已下线。'), 'announcement offline')
    await clickButton('申请审核')
    await waitFor(cdp, state => state.text.includes(student.name), 'pending application in admin')
    await clickButton('通过', student.name)
    await waitFor(cdp, state => state.text.includes('审核结果已保存。') && state.text.includes('已通过'), 'application review')
    await assertNoOverflow(cdp, 'reviewed admin page')

    await clickButton('资源管理')
    await waitFor(cdp, state => state.text.includes('资源管理') && state.text.includes('发布状态'), 'resource management tab')
    await fill('所属团队', 'software')
    await fill('访问范围', 'team')
    await fill('发布状态', 'published')
    await fill('标题', resourceTitle)
    await fill('摘要', 'E2E protected resource')
    await fill('正文 / 代码片段', 'E2E protected body')
    await attachFile('附件', 'e2e-retry-proof.pdf', 'application/pdf', '%PDF-1.4\nretry fixture\n%%EOF')
    await cdp.evaluate(failNextResourceUploadExpression())
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('资源草稿已保留，附件上传失败。') && state.text.includes('恢复为“已发布”'), 'resource upload failure recovery state')
    await assertNoOverflow(cdp, 'resource upload failure recovery state')
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('资源已发布。') && state.text.includes('附件：e2e-retry-proof.pdf'), 'resource attachment retry and publication')
    const duplicateResources = await cdp.evaluate(`(() => [...document.querySelectorAll('.lab-resource-item')].filter(item => item.textContent.includes(${JSON.stringify(resourceTitle)})).length)()`)
    if (duplicateResources !== 1) throw new Error(`resource retry created ${duplicateResources} matching records`)
    await waitFor(cdp, state => state.text.includes(resourceTitle) && state.text.includes('已发布'), 'resource publication after attachment retry')
    await assertNoOverflow(cdp, 'published resource admin page')
    await spaNavigate('/resources', 'a[href="/resources"]')
    await waitFor(cdp, state => state.text.includes(resourceTitle), 'published resource directory listing')
    await fill('搜索已发布资源', resourceTitle)
    await waitFor(cdp, state => state.text.includes(resourceTitle), 'published resource search')
    await fill('权限', 'team')
    await waitFor(cdp, state => state.text.includes(resourceTitle), 'team visibility resource filter')
    await fill('团队', 'software')
    await waitFor(cdp, state => state.text.includes(resourceTitle), 'resource directory team filter match')
    await assertNoOverflow(cdp, 'resource directory filters')
    await navigate('/admin')

    await clickButton('退出登录')
    await waitFor(cdp, state => state.path === '/portal', 'administrator logout')
    await navigate('/portal?mode=login')
    await fill('学号或用户名', student.studentId)
    await fill('密码', studentPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.path === '/member' && state.text.includes('已通过') && state.text.includes(resourceTitle), 'approved member login')
    await assertNoOverflow(cdp, 'approved member page')
    await fill('申请加入其他团队', 'hardware')
    await fill('申请说明（选填）', 'E2E second team flow')
    await cdp.evaluate(`(() => { const form = [...document.querySelectorAll('form')].find(item => item.textContent.includes('申请加入其他团队')); if (!form) throw new Error('Second team form not found'); form.requestSubmit(); return true })()`)
    await waitFor(cdp, state => state.text.includes('团队申请已提交'), 'second-team application')
    await assertNoOverflow(cdp, 'second-team application page')
    await clickButton('退出登录')
    await waitFor(cdp, state => state.path === '/portal', 'student logout before second review')
    await navigate('/portal?mode=login')
    await fill('学号或用户名', adminEmail)
    await fill('密码', adminPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.path === '/admin' && state.text.includes('管理员工作台'), 'administrator second login')
    await waitFor(cdp, state => state.text.includes(`${student.name} · 硬件团队`), 'second-team application in admin')
    await clickButton('通过', `${student.name} · 硬件团队`)
    await waitFor(cdp, state => state.text.includes('审核结果已保存。') && state.text.includes('硬件团队'), 'second-team review')
    await clickButton('成员管理')
    await waitFor(cdp, state => state.text.includes('成员管理') && state.text.includes('团队成员关系'), 'member management after second-team approval')
    await fill('团队', 'hardware')
    await sleep(120)
    const secondTeamMemberVisible = await cdp.evaluate(`(() => [...document.querySelectorAll('.admin-table')].find(table => [...table.querySelectorAll('th')].some(cell => cell.textContent.trim() === '账号'))?.querySelector('tbody')?.innerText.includes(${JSON.stringify(student.name)}))()`)
    if (!secondTeamMemberVisible) throw new Error('member team filter did not include the approved second-team member')
    await clickButton('资源管理')
    await waitFor(cdp, state => state.text.includes('资源管理') && state.text.includes('发布状态'), 'second resource management tab')
    await fill('所属团队', 'hardware')
    await fill('访问范围', 'team')
    await fill('标题', secondResourceTitle)
    await fill('摘要', 'E2E second team resource')
    await fill('正文 / 代码片段', 'E2E second team body')
    await submitVisibleForm()
    await waitFor(cdp, state => state.text.includes('资源草稿已保存。') && state.text.includes(secondResourceTitle) && state.text.includes('草稿'), 'second resource draft creation')
    await clickButton('发布', secondResourceTitle)
    await waitFor(cdp, state => state.text.includes('资源已发布。') && state.text.includes(secondResourceTitle), 'second resource publication')
    await assertNoOverflow(cdp, 'second resource admin page')
    await spaNavigate('/resources', 'a[href="/resources"]')
    await waitFor(cdp, state => state.text.includes(resourceTitle) && state.text.includes(secondResourceTitle), 'resource directory lists both team resources')
    await fill('团队', 'hardware')
    await waitFor(cdp, state => state.text.includes(secondResourceTitle) && !state.text.includes(resourceTitle), 'hardware resource directory team filter')
    await fill('团队', 'software')
    await waitFor(cdp, state => state.text.includes(resourceTitle) && !state.text.includes(secondResourceTitle), 'software resource directory team filter')
    await assertNoOverflow(cdp, 'resource directory filters for multiple teams')
    await navigate('/admin')
    await clickButton('退出登录')
    await waitFor(cdp, state => state.path === '/portal', 'administrator logout after second resource')
    await navigate('/portal?mode=login')
    await fill('学号或用户名', student.studentId)
    await fill('密码', studentPassword)
    await submitVisibleForm()
    await waitFor(cdp, state => state.path === '/member' && state.text.includes(secondResourceTitle), 'member login with second team')
    await assertNoOverflow(cdp, 'member page with second team')
    await clickButton('阅读资料', secondResourceTitle)
    await waitFor(cdp, state => state.text.includes('E2E second team body'), 'second-team resource read')
    await assertNoOverflow(cdp, 'second-team resource detail')
    await clickButton('阅读资料', resourceTitle)
    await waitFor(cdp, state => state.text.includes('E2E protected body'), 'member resource read')
    await assertNoOverflow(cdp, 'member resource detail')

    if (browserEvents.length) throw new Error(`Browser runtime errors: ${JSON.stringify(browserEvents)}`)
    return {
      pass: true,
      backend,
      viewport: 390,
      student: { studentId: student.studentId, username: student.username },
      resourceTitle,
      checks: ['student application', 'student pending login', 'administrator review', 'member team filter', 'team content edit/publication', 'site content edit/publication', 'project create/edit/offline', 'video and PDF upload/publication/anonymous byte checks/offline 404', 'uploaded video frame decoding', 'announcement publish/read/offline', 'failed resource upload retry restores the selected status without duplicate creation', 'second-team application/review/read', 'approved member resource read', 'mobile overflow'],
    }
  } finally {
    socket?.close()
    await stopProcess(browser)
    await stopProcess(vite)
    await stopProcess(server)
    await stopProcess(pocketBase?.process)
    await rm(browserProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(await runFlow())}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
