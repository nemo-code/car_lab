import { DatabaseSync } from 'node:sqlite'
import { execFileSync, spawn } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { buildImportReport } from './migration-import.mjs'
import { targetId } from './migration-plan.mjs'
import { createPocketBaseBackup, restorePocketBaseBackup } from './pocketbase-backup.mjs'
import { assertFixedVersion } from './verify-pocketbase-project-assets.mjs'
import { verifyPocketBaseBinary } from './verify-pocketbase.mjs'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const hooksDir = path.join(repoRoot, 'pocketbase', 'pb_hooks')
const sourceMigrationsDir = path.join(repoRoot, 'pocketbase', 'pb_migrations')
const versionPath = path.join(repoRoot, 'pocketbase', 'version.json')

function secret(label) {
  return `${label}-${randomBytes(18).toString('base64url')}`
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

function findBinary() {
  const candidates = [
    process.env.POCKETBASE_BINARY,
    path.join(repoRoot, '.runtime', 'bin', 'pocketbase'),
    path.join(repoRoot, 'pocketbase', 'pocketbase'),
  ].filter(Boolean)
  return candidates.find(filename => {
    try {
      execFileSync(filename, ['--version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }) || ''
}

function createLegacyFixture(filename) {
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT, student_id TEXT, username TEXT, name TEXT NOT NULL,
      grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE applications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, statement TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT
    );
    CREATE TABLE resources (
      id TEXT PRIMARY KEY, team TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
      visibility TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `)
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-admin', 'legacy-admin@example.invalid', '26000000001', 'legacyadmin', 'Legacy Admin',
    '26级', 'scrypt-hash-never-imported', 'software', 'approved', 'admin',
  )
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-member', null, '26000000002', 'legacymember', 'Legacy Member',
    '26级', 'scrypt-hash-never-imported', 'hardware', 'pending', 'member',
  )
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-approved', 'legacy-approved@example.invalid', '26000000003', 'legacyapproved', 'Legacy Approved',
    '26级', 'scrypt-hash-never-imported', 'simulation', 'approved', 'member',
  )
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-rejected', 'legacy-rejected@example.invalid', '26000000004', 'legacyrejected', 'Legacy Rejected',
    '26级', 'scrypt-hash-never-imported', 'hardware', 'rejected', 'member',
  )
  db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(
    'legacy-application-admin', 'legacy-admin', 'admin statement', 'approved', '2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z',
  )
  db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(
    'legacy-application-member', 'legacy-member', 'member statement', 'pending', '2026-10-16T00:00:00.000Z', null,
  )
  db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(
    'legacy-application-approved', 'legacy-approved', 'approved statement', 'approved', '2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z',
  )
  db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run(
    'legacy-application-rejected', 'legacy-rejected', 'rejected statement', 'rejected', '2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z',
  )
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-resource-public', 'software', 'Public legacy resource', 'Public legacy summary', 'public', 'Public legacy body', '2026-10-16T00:00:00.000Z',
  )
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-resource-team', 'hardware', 'Team legacy resource', 'Team legacy summary', 'team', 'Team legacy body', '2026-10-16T00:00:00.000Z',
  )
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'legacy-resource-simulation', 'simulation', 'Simulation legacy resource', 'Simulation legacy summary', 'team', 'Simulation legacy body', '2026-10-16T00:00:00.000Z',
  )
  db.close()
}

async function waitForHealth(base, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error('PocketBase exited before health check')
    try {
      const response = await fetch(`${base}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('PocketBase health check timed out')
}

async function request(base, pathname, options = {}, token = '') {
  const response = await fetch(`${base}/api${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body !== undefined && !(options.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch {}
  return { status: response.status, payload }
}

function expectStatus(result, expected, label) {
  if (result.status !== expected) throw new Error(`${label} returned ${result.status}`)
  return result
}

async function auth(base, email, password) {
  const result = await request(base, '/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: email, password }),
  })
  expectStatus(result, 200, 'superuser authentication')
  return result.payload.token
}

async function list(base, token, collection) {
  const result = await request(base, `/collections/${collection}/records?perPage=200`, {}, token)
  expectStatus(result, 200, `${collection} list`)
  return result.payload.items || []
}

function waitForProcessExit(child, timeoutMs) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise(resolve => {
    let timer
    const finish = exited => {
      clearTimeout(timer)
      child.off('exit', onExit)
      resolve(exited)
    }
    const onExit = () => finish(true)
    child.once('exit', onExit)
    if (Number.isFinite(timeoutMs)) {
      timer = setTimeout(() => finish(child.exitCode !== null || child.signalCode !== null), timeoutMs)
    }
  })
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  if (await waitForProcessExit(child, 3000)) return
  child.kill('SIGKILL')
  // Keep the caller from removing the runtime directory before the process exits.
  await waitForProcessExit(child)
}

async function createRecoveryFixture(base, superToken, teamId) {
  const stamp = `${Date.now()}-${randomBytes(3).toString('hex')}`
  const password = secret('RecoveryAdmin')
  const studentId = `29${String(Date.now()).slice(-9)}`
  const username = `restore${String(Date.now()).slice(-8)}`
  const created = await request(base, '/collections/users/records', {
    method: 'POST',
    body: JSON.stringify({
      email: `recovery-admin-${stamp}@example.invalid`,
      password,
      passwordConfirm: password,
      name: 'Recovery Fixture Admin',
      student_id: studentId,
      username,
      grade: '29级',
      primary_team: teamId,
      status: 'approved',
      role: 'admin',
      is_active: true,
    }),
  }, superToken)
  expectStatus(created, 200, 'recovery fixture admin creation')

  const login = await request(base, '/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: studentId, password }),
  })
  expectStatus(login, 200, 'recovery fixture admin login')

  const resource = await request(base, '/lab/resources', {
    method: 'POST',
    body: JSON.stringify({
      team: teamId,
      title: 'Backup restore fixture',
      summary: 'Synthetic runtime recovery check',
      visibility: 'public',
      body: 'Protected file restore fixture body',
      filename: '',
      size: 0,
    }),
  }, login.payload.token)
  expectStatus(resource, 201, 'recovery fixture resource creation')

  const fileBytes = Buffer.from('%PDF-1.4\nPocketBase restore fixture\n')
  const form = new FormData()
  form.set('resource', resource.payload.resource.id)
  form.set('body', 'Protected file restore fixture body')
  form.set('filename', 'restore-fixture.pdf')
  form.set('size', String(fileBytes.length))
  form.append('file', new Blob([fileBytes], { type: 'application/pdf' }), 'restore-fixture.pdf')
  const uploaded = await request(base, `/lab/resources/${encodeURIComponent(resource.payload.resource.id)}/file`, {
    method: 'POST',
    body: form,
  }, login.payload.token)
  expectStatus(uploaded, 200, 'recovery fixture protected file upload')

  const content = await request(base, `/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(resource.payload.resource.id)}%22&perPage=1`, {}, superToken)
  expectStatus(content, 200, 'recovery fixture content lookup')
  const contentRecord = content.payload.items?.[0]
  if (!contentRecord?.file) throw new Error('recovery fixture protected file missing')
  return { fileBytes, resourceId: resource.payload.resource.id, contentId: contentRecord.id, filename: contentRecord.file, studentId, password, token: login.payload.token }
}

async function assertRestoredFixture(base, superToken, fixture) {
  const teams = await list(base, superToken, 'teams')
  const users = await list(base, superToken, 'users')
  const memberships = await list(base, superToken, 'team_memberships')
  const applications = await list(base, superToken, 'applications')
  const resources = await list(base, superToken, 'resources')
  const contents = await list(base, superToken, 'resource_contents')
  if (teams.length !== 3 || users.length !== 5 || memberships.length !== 4 || applications.length !== 4 || resources.length !== 4 || contents.length !== 4) {
    throw new Error('restored PocketBase record counts do not match')
  }
  const teamIds = new Set(teams.map(team => team.id))
  const userById = new Map(users.map(user => [user.id, user]))
  const resourceById = new Map(resources.map(resource => [resource.id, resource]))
  if (new Set(teams.map(team => team.code)).size !== 3 || ['software', 'hardware', 'simulation'].some(code => !teams.some(team => team.code === code))) {
    throw new Error('restored team records do not match the configured teams')
  }
  if (memberships.some(membership => !userById.has(membership.user) || !teamIds.has(membership.team))) {
    throw new Error('restored team membership relations do not match')
  }
  if (applications.some(application => !userById.has(application.user) || !teamIds.has(application.team))) {
    throw new Error('restored application relations do not match')
  }
  if (resources.some(record => !teamIds.has(record.team) || !userById.has(record.created_by))) {
    throw new Error('restored resource relations do not match')
  }
  if (contents.some(content => !resourceById.has(content.resource) || content.team !== resourceById.get(content.resource)?.team || !content.body)) {
    throw new Error('restored resource content relations do not match')
  }
  const login = await request(base, '/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: fixture.studentId, password: fixture.password }),
  })
  expectStatus(login, 200, 'restored business admin login')
  const resource = await request(base, `/lab/resources/${encodeURIComponent(fixture.resourceId)}`, {}, login.payload.token)
  expectStatus(resource, 200, 'restored business resource read')
  if (resource.payload.content?.body !== 'Protected file restore fixture body') throw new Error('restored business content does not match')

  const fileToken = await request(base, '/files/token', { method: 'POST', body: '{}' }, login.payload.token)
  expectStatus(fileToken, 200, 'restored protected file token')
  const file = await fetch(`${base}/api/files/resource_contents/${encodeURIComponent(fixture.contentId)}/${encodeURIComponent(fixture.filename)}?token=${encodeURIComponent(fileToken.payload.token)}`)
  if (!file.ok || !Buffer.from(await file.arrayBuffer()).equals(fixture.fileBytes)) throw new Error('restored protected file bytes do not match')
  return {
      teams: teams.length,
    users: users.length,
    team_memberships: memberships.length,
    applications: applications.length,
    resources: resources.length,
    resource_contents: contents.length,
    relations: true,
    protectedFileRead: true,
  }
}

async function resetImportedAccount(base, adminToken, userId) {
  const password = secret('ImportedReset')
  const result = await request(base, `/lab/members/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  }, adminToken)
  expectStatus(result, 200, 'imported account password reset')
  const login = await request(base, '/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: '26000000003', password }),
  })
  expectStatus(login, 200, 'imported account login after reset')
  return { password, token: login.payload.token }
}

export async function verifyPocketBaseMigration(options = {}) {
  const version = JSON.parse(await readFile(versionPath, 'utf8'))
  const binary = options.binary || findBinary()
  if (!binary) throw new Error('PocketBase binary not found; set POCKETBASE_BINARY')
  assertFixedVersion(execFileSync(binary, ['--version'], { encoding: 'utf8' }), version.version)
  await verifyPocketBaseBinary(binary, version)

  const root = await mkdtemp(path.join(os.tmpdir(), 'car-lab-migration-'))
  const migrationsDir = path.join(root, 'pb_migrations')
  await cp(sourceMigrationsDir, migrationsDir, { recursive: true })
  const source = path.join(root, 'legacy.sqlite')
  const mappingFile = path.join(root, 'mapping.json')
  const dataDir = path.join(root, 'pb_data')
  const backupDir = path.join(root, 'pb_data-backup')
  const restoredDir = path.join(root, 'pb_data-restored')
  const email = `migration-super-${Date.now()}@example.invalid`
  const password = secret('MigrationSuper')
  createLegacyFixture(source)
  const sourceBefore = await readFile(source)
  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const restoredPort = await freePort()
  const restoredBase = `http://127.0.0.1:${restoredPort}`
  let child
  let restoredChild
  try {
    execFileSync(binary, [
      'superuser', 'create', email, password,
      '--dir', dataDir, '--hooksDir', hooksDir, '--migrationsDir', migrationsDir,
      '--automigrate=true',
    ], { stdio: 'ignore', timeout: 30000 })
    child = spawn(binary, [
      'serve', '--http', `127.0.0.1:${port}`, '--dir', dataDir,
      '--hooksDir', hooksDir, '--migrationsDir', migrationsDir,
      '--automigrate=true', '--hooksWatch=false',
    ], { stdio: 'ignore' })
    await waitForHealth(base, child)
    const token = await auth(base, email, password)

    const first = await buildImportReport(source, { apply: true, base, token, mappingFile })
    if (!first.readyForImport || first.writesPerformed !== 18) throw new Error('first import report did not match the fixture')
    if (!first.mapping?.persisted) throw new Error('first import did not persist mapping')

    const mapping = JSON.parse(await readFile(mappingFile, 'utf8'))
    if (mapping.sourceCounts.users !== 4 || mapping.sourceCounts.applications !== 4 || mapping.sourceCounts.resources !== 3) {
      throw new Error('mapping source counts do not match fixture')
    }
    if (JSON.stringify(mapping).includes('scrypt-hash') || JSON.stringify(mapping).includes('student_id')) {
      throw new Error('mapping contains sensitive legacy values')
    }

    const teams = await list(base, token, 'teams')
    const users = await list(base, token, 'users')
    const applications = await list(base, token, 'applications')
    const memberships = await list(base, token, 'team_memberships')
    const resources = await list(base, token, 'resources')
    const contents = await list(base, token, 'resource_contents')
    if (teams.length !== 3 || users.length !== 4 || memberships.length !== 4 || applications.length !== 4 || resources.length !== 3 || contents.length !== 3) {
      throw new Error('target collection counts do not match fixture')
    }
    const teamByCode = new Map(teams.map(team => [team.code, team.id]))
    for (const code of ['software', 'hardware', 'simulation']) {
      if (mapping.collections.teams.pairs.find(pair => pair.legacy_id === code)?.target_id !== teamByCode.get(code)) {
        throw new Error(`team mapping does not resolve target ${code}`)
      }
    }
    const importedById = new Map(users.map(user => [user.legacy_user_id, user]))
    const importedAdmin = importedById.get('legacy-admin')
    const importedPending = importedById.get('legacy-member')
    const importedApproved = importedById.get('legacy-approved')
    const importedRejected = importedById.get('legacy-rejected')
    if (!importedAdmin || importedAdmin.role !== 'admin' || importedAdmin.status !== 'approved' ||
        !importedPending || importedPending.status !== 'pending' ||
        !importedApproved || importedApproved.status !== 'approved' ||
        !importedRejected || importedRejected.status !== 'rejected' ||
        users.some(user => user.is_active)) {
      throw new Error('imported administrator/status samples do not match the fixture or accounts became active')
    }
    if (importedAdmin.primary_team !== teamByCode.get('software') || importedPending.primary_team !== teamByCode.get('hardware')) {
      throw new Error('user team relations do not match fixture')
    }
    if (importedApproved.primary_team !== teamByCode.get('simulation') || importedRejected.primary_team !== teamByCode.get('hardware')) {
      throw new Error('approved/rejected user team relations do not match fixture')
    }
    const membershipByUser = new Map(memberships.map(item => [item.user, item]))
    const applicationByUser = new Map(applications.map(item => [item.user, item]))
    const expectedMemberships = [
      [importedAdmin, 'approved', 'software'],
      [importedPending, 'pending', 'hardware'],
      [importedApproved, 'approved', 'simulation'],
      [importedRejected, 'rejected', 'hardware'],
    ]
    for (const [user, status, team] of expectedMemberships) {
      const membership = membershipByUser.get(user.id)
      if (!membership || membership.status !== status || membership.team !== teamByCode.get(team)) {
        throw new Error(`membership sample mismatch for ${status}/${team}`)
      }
      const application = applicationByUser.get(user.id)
      if (!application || application.status !== status || application.team !== teamByCode.get(team)) {
        throw new Error(`application sample mismatch for ${status}/${team}`)
      }
    }
    if (memberships.some(membership => !membership.user || !membership.team || !membership.status) || applications.some(application => !application.user || !application.team) || resources.some(resource => !resource.team || !resource.created_by)) {
      throw new Error('target relations are incomplete')
    }
    const resourceById = new Map(resources.map(resource => [resource.id, resource]))
    if (contents.some(content => !content.resource || !content.team || !content.body || resourceById.get(content.resource)?.team !== content.team)) {
      throw new Error('resource content relations are incomplete')
    }

    const second = await buildImportReport(source, { apply: true, base, token, mappingFile })
    if (second.writesPerformed !== 0 || second.collections.users.unchanged !== 4 || second.collections.team_memberships.unchanged !== 4 || second.collections.applications.unchanged !== 4 || second.collections.resources.unchanged !== 3 || second.collections.resource_contents.unchanged !== 3) {
      throw new Error('second import was not idempotent')
    }
    if (JSON.stringify(JSON.parse(await readFile(mappingFile, 'utf8'))) !== JSON.stringify(mapping)) {
      throw new Error('mapping changed between idempotent imports')
    }
    const sourceAfter = await readFile(source)
    if (!sourceBefore.equals(sourceAfter)) throw new Error('source SQLite changed during import')

    const recoveryFixture = await createRecoveryFixture(base, token, teamByCode.get('software'))
    const importedReset = await resetImportedAccount(base, recoveryFixture.token, importedApproved.id)
    const importedResetUser = await request(base, `/collections/users/records/${encodeURIComponent(importedApproved.id)}`, {}, token)
    expectStatus(importedResetUser, 200, 'imported account status after reset')
    if (importedResetUser.payload.is_active !== true) throw new Error('imported account was not activated after reset')
    const importedResource = resources.find(resource => resource.team === teamByCode.get('simulation'))
    if (!importedResource) throw new Error('imported simulation resource missing')
    const importedRead = await request(base, `/lab/resources/${encodeURIComponent(importedResource.id)}`, {}, importedReset.token)
    expectStatus(importedRead, 200, 'imported account team resource read after reset')
    const fixtureRead = await request(base, `/lab/resources/${encodeURIComponent(recoveryFixture.resourceId)}`, {}, token)
    expectStatus(fixtureRead, 200, 'pre-backup resource read')
    await stopProcess(child)
    child = null

    const backup = await createPocketBaseBackup(dataDir, backupDir, { sourceStopped: true })
    if (!backup.manifest.files.some(entry => entry.path.startsWith('storage/'))) throw new Error('backup manifest does not include PocketBase storage files')
    await restorePocketBaseBackup(backupDir, restoredDir)
    restoredChild = spawn(binary, [
      'serve', '--http', `127.0.0.1:${restoredPort}`, '--dir', restoredDir,
      '--hooksDir', hooksDir, '--migrationsDir', migrationsDir,
      '--automigrate=true', '--hooksWatch=false',
    ], { stdio: 'ignore' })
    await waitForHealth(restoredBase, restoredChild)
    const restoredToken = await auth(restoredBase, email, password)
    const restored = await assertRestoredFixture(restoredBase, restoredToken, recoveryFixture)

    return {
      pass: true,
      source: { users: 4, applications: 4, resources: 3, unchanged: true },
      target: { teams: 3, users: 4, team_memberships: 4, applications: 4, resources: 3, resource_contents: 3, relations: true },
      import: { firstWrites: first.writesPerformed, secondWrites: second.writesPerformed, mappingPersisted: true, inactiveAccounts: true, importedAccountResetLogin: true, importedTeamResourceReadAfterReset: true, sampledStatuses: ['admin/approved', 'pending', 'approved', 'rejected'], sampledTeams: ['software', 'hardware', 'simulation'] },
      backupRestore: { files: backup.files, storageIncluded: true, ...restored },
    }
  } finally {
    await stopProcess(child)
    await stopProcess(restoredChild)
    await rm(root, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifyPocketBaseMigration()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.pass ? 0 : 1
  } catch {
    process.stderr.write('PocketBase migration isolation verification failed.\n')
    process.exitCode = 2
  }
}
