import { DatabaseSync } from 'node:sqlite'
import { randomBytes, createHash } from 'node:crypto'
import { chmod, lstat, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { buildMigrationPlan, configuredTeams, targetId } from './migration-plan.mjs'
import { inspectLegacyDatabase } from './migration-preflight.mjs'

const MAX_BODY = 100000
const MAX_PAGE = 200

function usage() {
  process.stderr.write('Usage: POCKETBASE_URL=http://127.0.0.1:18082 POCKETBASE_ADMIN_TOKEN=<token> node scripts/migration-import.mjs /absolute/path/to/approved-sqlite-copy [--apply] [--mapping-file /absolute/path/to/mapping.json]\n')
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}

function randomPassword() {
  return `Migrated-${randomBytes(24).toString('base64url')}`
}

function pocketbaseDate(value) {
  const input = String(value || '').trim()
  return input ? input.replace('T', ' ') : ''
}

function safeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function readRows(filename) {
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    db.exec('PRAGMA query_only = ON; BEGIN;')
    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name))
    const email = userColumns.has('email') ? 'email' : "'' AS email"
    return {
      users: db.prepare(`SELECT id, ${email}, student_id, username, name, grade, team, status, role FROM users ORDER BY id`).all(),
      applications: db.prepare('SELECT id, user_id, statement, status, created_at, reviewed_at FROM applications ORDER BY id').all(),
      resources: db.prepare('SELECT id, team, title, summary, visibility, body, created_at FROM resources ORDER BY id').all(),
    }
  } finally {
    db.close()
  }
}

function sourceDigest(rows) {
  return hash(rows.map(row => JSON.stringify(row)).join('\n'))
}

function mappingPairs(collection, rows) {
  return rows
    .map(row => String(row.id ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map(legacyId => ({ legacy_id: legacyId, target_id: targetId(collection, legacyId) }))
}

function mappingCollection(pairs) {
  return {
    records: pairs.length,
    mappingDigest: hash(pairs.map(pair => `${pair.legacy_id}:${pair.target_id}`).join('\n')),
    pairs,
  }
}

/**
 * Build the separately persisted ID map. This projection deliberately keeps
 * only opaque source IDs and deterministic target IDs; source identities,
 * credentials, statements and resource bodies never enter the artifact.
 */
export function buildMappingArtifact(rows, report, teamIds = null) {
  const collections = {
    teams: mappingCollection(configuredTeams
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map(legacyId => ({ legacy_id: legacyId, target_id: teamIds?.[legacyId] || targetId('teams', legacyId) }))),
    users: mappingCollection(mappingPairs('users', rows.users)),
    team_memberships: mappingCollection(mappingPairs('team_memberships', rows.users.map(row => ({ id: `${row.id}:${row.team}` })))),
    applications: mappingCollection(mappingPairs('applications', rows.applications)),
    resources: mappingCollection(mappingPairs('resources', rows.resources)),
    resource_contents: mappingCollection(mappingPairs('resource_contents', rows.resources)),
  }
  return {
    formatVersion: 1,
    type: 'legacy-to-pocketbase-id-mapping',
    source: 'legacy-sqlite',
    sourceDigest: report.sourceDigest,
    sourceCounts: report.sourceCounts,
    target: { engine: 'PocketBase', version: '0.40.5' },
    targetIdSource: teamIds ? 'target-records-for-teams-deterministic-for-imported-records' : 'deterministic-plan',
    collections,
  }
}

async function persistMappingFile(filename, artifact, sourceFilename) {
  const destination = path.resolve(String(filename))
  const source = await realpath(path.resolve(String(sourceFilename)))
  const existing = await lstat(destination).catch(error => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing?.isSymbolicLink()) throw new Error('Mapping file must not be a symbolic link')
  if (existing?.isDirectory()) throw new Error('Mapping file path is a directory')
  if (existing && await realpath(destination) === source) throw new Error('Mapping file must be different from the read-only source database')

  const temporary = `${destination}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`
  try {
    await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await chmod(temporary, 0o600)
    await rename(temporary, destination)
    await chmod(destination, 0o600)
  } finally {
    await rm(temporary, { force: true })
  }
  return { records: Object.values(artifact.collections).reduce((sum, collection) => sum + collection.records, 0) }
}

function emptyCollectionReport(records = 0) {
  return { records, created: 0, updated: 0, unchanged: 0, failed: 0 }
}

async function request(base, token, pathName, options = {}) {
  const response = await fetch(`${base}/api${pathName}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || `PocketBase request failed (${response.status})`)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

async function getRecord(base, token, collection, id) {
  try {
    return await request(base, token, `/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function upsert(base, token, collection, id, data, report, options = {}) {
  const existing = await getRecord(base, token, collection, id)
  if (!existing) {
    await request(base, token, `/collections/${encodeURIComponent(collection)}/records`, {
      method: 'POST',
      body: JSON.stringify({ id, ...data }),
    })
    report.created += 1
    return { action: 'created', id }
  }
  if (options.skipUpdate) {
    report.unchanged += 1
    return { action: 'unchanged', id }
  }
  const comparable = options.compare || Object.keys(data)
  const changed = comparable.some(key => JSON.stringify(existing[key] ?? null) !== JSON.stringify(data[key] ?? null))
  if (!changed) {
    report.unchanged += 1
    return { action: 'unchanged', id }
  }
  await request(base, token, `/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  report.updated += 1
  return { action: 'updated', id }
}

async function listByFilter(base, token, collection, filter) {
  const query = new URLSearchParams({ filter, perPage: String(MAX_PAGE) })
  const result = await request(base, token, `/collections/${encodeURIComponent(collection)}/records?${query}`)
  return result.items || []
}

function assertLoopbackTarget(base) {
  let target
  try {
    target = new URL(base)
  } catch {
    throw new Error('Migration target must be a local PocketBase URL')
  }
  const hostname = target.hostname.toLowerCase()
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
  if (!loopback || !['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('Migration target must be a local PocketBase URL')
  }
  return target.origin
}

async function listAllRecords(base, token, collection) {
  const items = []
  for (let page = 1; page <= 1000; page += 1) {
    const query = new URLSearchParams({ perPage: String(MAX_PAGE), page: String(page) })
    const result = await request(base, token, `/collections/${encodeURIComponent(collection)}/records?${query}`)
    const current = result.items || []
    items.push(...current)
    if (items.length >= Number(result.totalItems || 0) || current.length < MAX_PAGE) return items
  }
  throw new Error(`Migration target collection is too large to validate: ${collection}`)
}

async function assertImportTarget(base, token, rows) {
  const localBase = assertLoopbackTarget(base)
  await request(localBase, token, '/health')

  const teams = await listAllRecords(localBase, token, 'teams')
  const expectedTeams = new Set(configuredTeams)
  if (teams.length !== expectedTeams.size || teams.some(team => !expectedTeams.has(team.code)) || new Set(teams.map(team => team.code)).size !== expectedTeams.size) {
    throw new Error('Migration target must contain only the three configured teams')
  }
  const teamIds = Object.fromEntries(teams.map(team => [team.code, team.id]))
  const userIds = new Map(rows.users.map(row => [String(row.id ?? '').trim(), targetId('users', String(row.id ?? '').trim())]))
  const fallbackCreator = rows.users.find(row => row.role === 'admin') || rows.users[0]
  const creatorId = fallbackCreator ? userIds.get(String(fallbackCreator.id ?? '').trim()) : null

  const expected = {
    users: rows.users.map(row => {
      const legacyId = String(row.id ?? '').trim()
      return {
        id: targetId('users', legacyId),
        legacy_user_id: legacyId,
        email: safeEmail(row.email),
        emailVisibility: false,
        student_id: String(row.student_id || ''),
        username: String(row.username || '').trim().toLowerCase(),
        name: String(row.name || '').trim(),
        grade: String(row.grade || '').trim() || `${String(row.student_id || '').slice(0, 2)}级`,
        primary_team: teamIds[row.team],
        status: row.status,
        role: row.role,
      }
    }),
    team_memberships: rows.users.map(row => ({
      id: targetId('team_memberships', `${String(row.id ?? '').trim()}:${row.team}`),
      user: userIds.get(String(row.id ?? '').trim()),
      team: teamIds[row.team],
      status: row.status,
      role: 'member',
      is_active: row.status !== 'rejected',
      joined_at: '',
      reviewed_at: '',
    })),
    applications: rows.applications.map(row => {
      const legacyUserId = String(row.user_id ?? '').trim()
      const user = rows.users.find(item => String(item.id ?? '').trim() === legacyUserId)
      return {
        id: targetId('applications', String(row.id ?? '').trim()),
        user: userIds.get(legacyUserId),
        team: teamIds[user?.team],
        statement: String(row.statement || ''),
        status: row.status,
        reviewed_at: pocketbaseDate(row.reviewed_at),
        legacy_created_at: String(row.created_at || ''),
      }
    }),
    resources: rows.resources.map(row => ({
      id: targetId('resources', String(row.id ?? '').trim()),
      team: teamIds[row.team],
      title: String(row.title || ''),
      summary: String(row.summary || ''),
      visibility: row.visibility,
      status: 'published',
      created_by: creatorId,
      legacy_created_at: String(row.created_at || ''),
    })),
    resource_contents: rows.resources.map(row => ({
      id: targetId('resource_contents', String(row.id ?? '').trim()),
      resource: targetId('resources', String(row.id ?? '').trim()),
      team: teamIds[row.team],
      body: String(row.body || ''),
      legacy_created_at: String(row.created_at || ''),
      filename: '',
      size: 0,
    })),
  }

  for (const [collection, records] of Object.entries(expected)) {
    const expectedById = new Map(records.map(record => [record.id, record]))
    if (expectedById.size !== records.length) throw new Error(`Migration source contains colliding ${collection} IDs`)
    const existing = await listAllRecords(localBase, token, collection)
    if (existing.some(record => !expectedById.has(record.id))) {
      throw new Error(`Migration target collection contains unrelated records: ${collection}`)
    }
    if (existing.some(record => {
      const expectedRecord = expectedById.get(record.id)
      return Object.entries(expectedRecord).some(([key, value]) => JSON.stringify(record[key] ?? null) !== JSON.stringify(value ?? null))
    })) {
      throw new Error(`Migration target contains a conflicting ${collection} record`)
    }
  }
  return { base: localBase, teams: teamIds }
}

function makeReport(filename, plan, rows, mode) {
  return {
    formatVersion: 1,
    source: 'legacy-sqlite',
    mode,
    readyForImport: !plan.blockedByPreflight && !plan.mappingIssues && !plan.relationIssues,
    writesPerformed: 0,
    sourceDigest: {
      users: sourceDigest(rows.users),
      applications: sourceDigest(rows.applications),
      resources: sourceDigest(rows.resources),
    },
    sourceCounts: {
      users: rows.users.length,
      applications: rows.applications.length,
      resources: rows.resources.length,
      resource_contents: rows.resources.length,
      team_memberships: rows.users.length,
    },
    target: { engine: 'PocketBase', version: '0.40.5', writeMode: mode === 'apply' ? 'authorized-superuser-token' : 'disabled', legacyUserIdField: 'users.legacy_user_id' },
    collections: {
      teams: emptyCollectionReport(3),
      users: emptyCollectionReport(rows.users.length),
      team_memberships: emptyCollectionReport(rows.users.length),
      applications: emptyCollectionReport(rows.applications.length),
      resources: emptyCollectionReport(rows.resources.length),
      resource_contents: emptyCollectionReport(rows.resources.length),
    },
    activation: {
      required: rows.users.length,
      strategy: 'new PocketBase passwords are random and never emitted; imported accounts remain inactive until an administrator verifies identity and resets the password through the controlled reset route',
    },
    sensitiveDataPolicy: {
      passwordHashes: 'excluded; never imported',
      sessions: 'excluded; never imported',
      report: 'sanitized counts, digests and action totals only',
    },
    diff: { users: 0, applications: 0, resources: 0, resource_contents: 0 },
  }
}

export async function buildImportReport(filename, options = {}) {
  const preflight = inspectLegacyDatabase(filename)
  const plan = buildMigrationPlan(filename)
  const rows = preflight.sourceDataChecksPassed ? readRows(filename) : { users: [], applications: [], resources: [] }
  const report = makeReport(filename, plan, rows, options.apply ? 'apply' : 'dry-run')
  report.preflight = {
    sourceDataChecksPassed: preflight.sourceDataChecksPassed === true,
    issueCounts: Object.fromEntries(Object.entries(preflight.checks || {}).map(([name, check]) => [name, check.count])),
  }
  if (!report.readyForImport) {
    report.nextGate = 'Fix preflight, mapping or relation findings before import.'
    return report
  }
  if (rows.resources.some(row => String(row.body || '').length > MAX_BODY)) {
    report.readyForImport = false
    report.preflight.issueCounts.resourceBodyTooLarge = rows.resources.filter(row => String(row.body || '').length > MAX_BODY).length
    report.nextGate = 'Reduce or review legacy resource bodies over PocketBase resource_contents.body limit.'
    return report
  }
  if (options.apply) {
    if (!options.base || !options.token) throw new Error('PocketBase target and token are required for --apply')
    const target = await assertImportTarget(options.base, options.token, rows)
    if (options.mappingFile) {
      const mapping = await persistMappingFile(options.mappingFile, buildMappingArtifact(rows, report, target.teams), filename)
      report.mapping = { persisted: true, records: mapping.records }
    }
    await executeImport(filename, rows, report, { ...options, target })
  } else if (options.mappingFile) {
    const mapping = await persistMappingFile(options.mappingFile, buildMappingArtifact(rows, report), filename)
    report.mapping = { persisted: true, records: mapping.records }
  }
  return report
}

async function executeImport(filename, rows, report, options) {
  const { token } = options
  const { base, teams } = options.target
  const userIds = new Map()
  const userData = new Map()
  for (const row of rows.users) {
    const legacyId = String(row.id ?? '').trim()
    const id = targetId('users', legacyId)
    const data = {
      legacy_user_id: legacyId,
      email: safeEmail(row.email),
      emailVisibility: false,
      student_id: String(row.student_id || ''),
      username: String(row.username || '').trim().toLowerCase(),
      name: String(row.name || '').trim(),
      grade: String(row.grade || '').trim() || `${String(row.student_id || '').slice(0, 2)}级`,
      primary_team: teams[row.team],
      status: row.status,
      role: row.role,
      is_active: false,
      password: randomPassword(),
      passwordConfirm: '',
    }
    data.passwordConfirm = data.password
    const existing = await getRecord(base, token, 'users', id)
    if (existing) {
      await upsert(base, token, 'users', id, { ...data, password: undefined, passwordConfirm: undefined }, report.collections.users, { compare: ['legacy_user_id', 'email', 'emailVisibility', 'student_id', 'username', 'name', 'grade', 'primary_team', 'status', 'role'] })
    } else {
      await upsert(base, token, 'users', id, data, report.collections.users)
    }
    userIds.set(legacyId, id)
    userData.set(legacyId, row)
    const membershipId = targetId('team_memberships', `${legacyId}:${row.team}`)
    await upsert(base, token, 'team_memberships', membershipId, {
      user: id,
      team: teams[row.team],
      status: row.status,
      role: 'member',
      is_active: row.status !== 'rejected',
      joined_at: '',
      reviewed_at: '',
    }, report.collections.team_memberships)
  }
  const fallbackCreator = rows.users.find(row => row.role === 'admin') || rows.users[0]
  const creatorId = fallbackCreator ? userIds.get(String(fallbackCreator.id)) : null
  if (rows.resources.length && !creatorId) throw new Error('Legacy resources require at least one imported user for created_by')
  const resourceIds = new Map()
  for (const row of rows.applications) {
    const userId = userIds.get(String(row.user_id ?? '').trim())
    const user = userData.get(String(row.user_id ?? '').trim())
    if (!userId || !user || !teams[user.team]) throw new Error('Application relation mapping failed')
    const id = targetId('applications', String(row.id ?? '').trim())
    const data = {
      user: userId,
      team: teams[user.team],
      statement: String(row.statement || ''),
      status: row.status,
      reviewed_at: pocketbaseDate(row.reviewed_at),
      legacy_created_at: String(row.created_at || ''),
    }
    await upsert(base, token, 'applications', id, data, report.collections.applications)
  }
  for (const row of rows.resources) {
    const legacyId = String(row.id ?? '').trim()
    const id = targetId('resources', legacyId)
    const data = {
      team: teams[row.team],
      title: String(row.title || ''),
      summary: String(row.summary || ''),
      visibility: row.visibility,
      status: 'published',
      created_by: creatorId,
      legacy_created_at: String(row.created_at || ''),
    }
    await upsert(base, token, 'resources', id, data, report.collections.resources)
    resourceIds.set(legacyId, id)
    const contentId = targetId('resource_contents', legacyId)
    await upsert(base, token, 'resource_contents', contentId, {
      resource: id,
      team: teams[row.team],
      body: String(row.body || ''),
      legacy_created_at: String(row.created_at || ''),
      filename: '',
      size: 0,
    }, report.collections.resource_contents)
  }
  report.writesPerformed = Object.values(report.collections).reduce((sum, item) => sum + item.created + item.updated, 0)
  report.diff = Object.fromEntries(Object.entries(report.collections).map(([name, item]) => [name, item.created + item.updated]))
  report.nextGate = 'Verify target counts, relations, reset one imported account through the controlled admin route, then run the second import and compare this report.'
  return { teamIds: teams }
}

function parseArgs(argv) {
  let apply = false
  let filename = ''
  let mappingFile = ''
  let invalid = false
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--apply') {
      apply = true
    } else if (value === '--mapping-file') {
      const next = argv[index + 1]
      if (!next || next.startsWith('--')) invalid = true
      else { mappingFile = next; index += 1 }
    } else if (value.startsWith('--mapping-file=')) {
      mappingFile = value.slice('--mapping-file='.length)
      if (!mappingFile) invalid = true
    } else if (value.startsWith('--')) {
      invalid = true
    } else if (!filename) {
      filename = value
    } else {
      invalid = true
    }
  }
  return { apply, filename, mappingFile, invalid }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { apply, filename, mappingFile, invalid } = parseArgs(process.argv.slice(2))
  if (invalid || !filename || filename.startsWith('-')) {
    usage()
    process.exitCode = 2
  } else {
    const base = String(process.env.POCKETBASE_URL || '').replace(/\/+$/, '')
    const token = String(process.env.POCKETBASE_ADMIN_TOKEN || '')
    try {
      const report = await buildImportReport(path.resolve(filename), { apply, base, token, mappingFile: mappingFile ? path.resolve(mappingFile) : undefined })
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      process.exitCode = report.readyForImport ? 0 : 1
    } catch {
      process.stderr.write('Migration import failed: source, target, credentials or relation mapping is invalid.\n')
      process.exitCode = 2
    }
  }
}
