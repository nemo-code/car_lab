import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildImportReport } from './migration-import.mjs'
import { targetId } from './migration-plan.mjs'

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'car-lab-import-'))
  const file = path.join(dir, 'legacy.sqlite')
  const db = new DatabaseSync(file)
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, student_id TEXT, username TEXT, name TEXT NOT NULL,
      grade TEXT, password_hash TEXT NOT NULL, team TEXT NOT NULL, status TEXT NOT NULL, role TEXT NOT NULL);
    CREATE TABLE applications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, statement TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT);
    CREATE TABLE resources (id TEXT PRIMARY KEY, team TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
      visibility TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
  `)
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('u1', 'admin@example.invalid', '26000000001', 'admin01', 'Admin', '26级', 'legacy-hash-admin', 'software', 'approved', 'admin')
  db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('u2', null, '26000000002', null, 'Member', '26级', 'legacy-hash-member', 'hardware', 'pending', 'member')
  db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run('a1', 'u1', 'admin application', 'approved', '2026-10-16T00:00:00.000Z', '2026-10-16T01:00:00.000Z')
  db.prepare('INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?)').run('a2', 'u2', 'member application', 'pending', '2026-10-16T00:00:00.000Z', null)
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run('r1', 'software', 'Open', 'Open summary', 'public', 'Public body', '2026-10-16T00:00:00.000Z')
  db.prepare('INSERT INTO resources VALUES (?, ?, ?, ?, ?, ?, ?)').run('r2', 'hardware', 'Private', 'Private summary', 'team', 'Private body', '2026-10-16T00:00:00.000Z')
  db.close()
  return file
}

function targetServer() {
  const records = new Map()
  const teams = [
    { id: 'team-software', code: 'software' },
    { id: 'team-hardware', code: 'hardware' },
    { id: 'team-simulation', code: 'simulation' },
  ]
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    const parts = url.pathname.split('/').filter(Boolean)
    const json = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (parts[0] !== 'api') return json(404, {})
    if (parts[1] === 'health' && req.method === 'GET') return json(200, { code: 200, message: 'API is healthy.' })
    const collection = parts[2]
    if (parts[1] === 'collections' && collection === 'teams' && req.method === 'GET' && parts[3] === 'records') {
      const code = decodeURIComponent((url.searchParams.get('filter') || '').split('=')[1]?.trim()?.replaceAll('"', '') || '')
      return json(200, { items: teams.filter(team => !code || team.code === code), totalItems: 1 })
    }
    if (parts[1] !== 'collections' || parts[3] !== 'records') return json(404, {})
    const id = parts[4]
    if (req.method === 'GET' && id) {
      const row = records.get(`${collection}:${id}`)
      return row ? json(200, row) : json(404, { message: 'missing' })
    }
    if (req.method === 'GET') {
      const rows = [...records.values()].filter(row => row.collection === collection)
      return json(200, { items: rows, totalItems: rows.length })
    }
    let body = ''
    for await (const chunk of req) body += chunk
    const data = body ? JSON.parse(body) : {}
    if (req.method === 'POST') {
      const row = { ...data, collection }
      records.set(`${collection}:${data.id}`, row)
      return json(200, row)
    }
    if (req.method === 'PATCH' && id) {
      const key = `${collection}:${id}`
      const row = { ...(records.get(key) || { id, collection }), ...data, id, collection }
      records.set(key, row)
      return json(200, row)
    }
    return json(404, {})
  })
  return { server, records }
}

test('MIG-01 imports twice without duplicate target records or old credentials', async (t) => {
  const file = fixture()
  const before = readFileSync(file)
  const { server, records } = targetServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const { port } = server.address()
  const options = { apply: true, base: `http://127.0.0.1:${port}`, token: 'test-token' }
  const first = await buildImportReport(file, options)
  const second = await buildImportReport(file, options)
  assert.equal(first.readyForImport, true)
  assert.equal(first.writesPerformed, 10)
  assert.equal(second.writesPerformed, 0)
  assert.equal(second.collections.users.unchanged, 2)
  assert.equal(records.size, 2 + 2 + 2 + 2 + 2)
  assert.equal([...records.values()].some(record => JSON.stringify(record).includes('legacy-hash')), false)
  assert.deepEqual(readFileSync(file), before)
})

test('MIG-02 report keeps deterministic mappings and activation requirement', async () => {
  const file = fixture()
  const report = await buildImportReport(file)
  assert.equal(report.mode, 'dry-run')
  assert.equal(report.activation.required, 2)
  assert.equal(report.activation.strategy.includes('never emitted'), true)
  assert.equal(report.sourceCounts.resource_contents, 2)
  assert.equal(targetId('users', 'u1').length, 15)
  assert.equal(report.readyForImport, true)
})

test('MIG-03 persists an explicit sanitized legacy-to-target mapping', async () => {
  const file = fixture()
  const mappingFile = path.join(path.dirname(file), 'mapping.json')
  const before = readFileSync(file)
  const report = await buildImportReport(file, { mappingFile })
  assert.deepEqual(report.mapping, { persisted: true, records: 13 })
  assert.equal(existsSync(mappingFile), true)
  assert.equal(statSync(mappingFile).mode & 0o777, 0o600)

  const mapping = JSON.parse(readFileSync(mappingFile, 'utf8'))
  assert.equal(mapping.type, 'legacy-to-pocketbase-id-mapping')
  assert.deepEqual(mapping.collections.users.pairs, [
    { legacy_id: 'u1', target_id: targetId('users', 'u1') },
    { legacy_id: 'u2', target_id: targetId('users', 'u2') },
  ])
  assert.deepEqual(mapping.collections.resource_contents.pairs, [
    { legacy_id: 'r1', target_id: targetId('resource_contents', 'r1') },
    { legacy_id: 'r2', target_id: targetId('resource_contents', 'r2') },
  ])
  assert.deepEqual(mapping.collections.team_memberships.pairs, [
    { legacy_id: 'u1:software', target_id: targetId('team_memberships', 'u1:software') },
    { legacy_id: 'u2:hardware', target_id: targetId('team_memberships', 'u2:hardware') },
  ])
  const serialized = readFileSync(mappingFile, 'utf8')
  assert.doesNotMatch(serialized, /legacy-hash-admin|legacy-hash-member/)
  assert.doesNotMatch(serialized, /Public body|Private body|admin application|member application/)
  assert.doesNotMatch(serialized, /password_hash|statement|student_id|email/)
  assert.deepEqual(readFileSync(file), before)

  const second = await buildImportReport(file, { mappingFile })
  assert.deepEqual(JSON.parse(readFileSync(mappingFile, 'utf8')), mapping)
  assert.deepEqual(second.mapping, { persisted: true, records: 13 })
})

test('MIG-04 does not create a mapping file by default and never overwrites the source', async () => {
  const file = fixture()
  const defaultMapping = path.join(path.dirname(file), 'mapping.json')
  const before = readFileSync(file)
  const report = await buildImportReport(file)
  assert.equal(report.mapping, undefined)
  assert.equal(existsSync(defaultMapping), false)
  await assert.rejects(() => buildImportReport(file, { mappingFile: file }), /different from the read-only source database/)
  assert.deepEqual(readFileSync(file), before)
})

test('MIG-05 apply mapping records actual target team IDs', async (t) => {
  const file = fixture()
  const mappingFile = path.join(path.dirname(file), 'mapping.json')
  const { server } = targetServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const { port } = server.address()
  const report = await buildImportReport(file, {
    apply: true,
    base: `http://127.0.0.1:${port}`,
    token: 'test-token',
    mappingFile,
  })
  const mapping = JSON.parse(readFileSync(mappingFile, 'utf8'))
  assert.equal(report.mapping.persisted, true)
  assert.equal(mapping.targetIdSource, 'target-records-for-teams-deterministic-for-imported-records')
  assert.deepEqual(mapping.collections.teams.pairs, [
    { legacy_id: 'hardware', target_id: 'team-hardware' },
    { legacy_id: 'simulation', target_id: 'team-simulation' },
    { legacy_id: 'software', target_id: 'team-software' },
  ])
})

test('MIG-06 refuses non-loopback targets before making a network request', async () => {
  const file = fixture()
  await assert.rejects(() => buildImportReport(file, {
    apply: true,
    base: 'https://pocketbase.example.invalid',
    token: 'test-token',
  }), /local PocketBase URL/)
})

test('MIG-07 refuses targets with unrelated records before writing', async (t) => {
  const file = fixture()
  const { server, records } = targetServer()
  records.set('users:preexisting', { id: 'preexisting', collection: 'users', legacy_user_id: 'other-source' })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const { port } = server.address()
  await assert.rejects(() => buildImportReport(file, {
    apply: true,
    base: `http://127.0.0.1:${port}`,
    token: 'test-token',
  }), /contains unrelated records: users/)
  assert.equal(records.size, 1)
})

test('MIG-08 refuses conflicting records that reuse expected IDs in every imported collection', async (t) => {
  const conflicts = [
    { collection: 'users', legacyId: 'u1', mismatch: { legacy_user_id: 'u1', name: 'A different target user' } },
    { collection: 'team_memberships', legacyId: 'u1:software', mismatch: { user: 'unrelated-user' } },
    { collection: 'applications', legacyId: 'a1', mismatch: { statement: 'A different application' } },
    { collection: 'resources', legacyId: 'r1', mismatch: { title: 'A different resource' } },
    { collection: 'resource_contents', legacyId: 'r1', mismatch: { body: 'A different resource body' } },
  ]

  for (const conflict of conflicts) {
    await t.test(conflict.collection, async (t) => {
      const file = fixture()
      const { server, records } = targetServer()
      const id = targetId(conflict.collection, conflict.legacyId)
      const record = { id, collection: conflict.collection, ...conflict.mismatch }
      records.set(`${conflict.collection}:${id}`, record)
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      t.after(() => server.close())
      const { port } = server.address()

      await assert.rejects(() => buildImportReport(file, {
        apply: true,
        base: `http://127.0.0.1:${port}`,
        token: 'test-token',
      }), new RegExp(`conflicting ${conflict.collection} record`))
      assert.equal(records.size, 1)
      assert.deepEqual(records.get(`${conflict.collection}:${id}`), record)
    })
  }
})

test('MIG-09 mapping output failure happens before target writes', async (t) => {
  const file = fixture()
  const { server, records } = targetServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const { port } = server.address()
  await assert.rejects(() => buildImportReport(file, {
    apply: true,
    base: `http://127.0.0.1:${port}`,
    token: 'test-token',
    mappingFile: path.join(path.dirname(file), 'missing', 'mapping.json'),
  }), /ENOENT/)
  assert.equal(records.size, 0)
})

test('MIG-10 newer SQLite schemas are blocked before target validation or writes', async () => {
  const file = fixture()
  const db = new DatabaseSync(file)
  db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE applications ADD COLUMN team TEXT;
    ALTER TABLE resources ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
    CREATE TABLE team_memberships (id TEXT PRIMARY KEY);
    CREATE TABLE resource_contents (id TEXT PRIMARY KEY);
    CREATE TABLE project_assets (id TEXT PRIMARY KEY);`)
  db.close()
  const before = readFileSync(file)
  const report = await buildImportReport(file, {
    apply: true,
    base: 'https://pocketbase.example.invalid',
    token: 'must-not-be-used',
  })
  assert.equal(report.readyForImport, false)
  assert.equal(report.preflight.issueCounts.unsupportedSourceSchema, 6)
  assert.equal(report.writesPerformed, 0)
  assert.deepEqual(readFileSync(file), before)
})
