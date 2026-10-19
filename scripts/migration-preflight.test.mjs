import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { inspectLegacyDatabase } from './migration-preflight.mjs'

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-preflight-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'legacy.sqlite')
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE users (id TEXT, email TEXT, student_id TEXT, username TEXT, name TEXT, team TEXT, status TEXT, role TEXT, password_hash TEXT);
    CREATE TABLE applications (id TEXT, user_id TEXT, status TEXT, statement TEXT, created_at TEXT, reviewed_at TEXT);
    CREATE TABLE resources (id TEXT, team TEXT, title TEXT, summary TEXT, visibility TEXT, body TEXT, created_at TEXT);`)
  return { db, file }
}

test('valid source: counted consistently, private values omitted, database unchanged', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('member-id',NULL,'25010720735','StudentName','Private Name','software','approved','member','SECRET_HASH');
    INSERT INTO users VALUES ('admin-id','admin@example.invalid',NULL,NULL,'Private Admin','hardware','approved','admin','ADMIN_HASH');
    INSERT INTO applications VALUES ('application-id','member-id','approved','SECRET_STATEMENT','2026-01-01',NULL);
    INSERT INTO resources VALUES ('resource-id','software','Title','Summary','team','SECRET_BODY','2026-01-01');`)
  db.close()
  const before = readFileSync(file)
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, true)
  assert.equal(report.readyForImport, false)
  assert.deepEqual(report.counts, { users: 2, applications: 1, resources: 1, configuredTeams: 3, referencedTeams: 2 })
  assert.equal(report.privacy.protectedBodies, 1)
  for (const value of ['25010720735', 'StudentName', 'Private Name', 'SECRET_HASH', 'SECRET_STATEMENT', 'SECRET_BODY', 'member-id']) {
    assert.equal(JSON.stringify(report).includes(value), false)
  }
  assert.deepEqual(readFileSync(file), before)
})

test('dirty source reports normalized duplicates, invalid data and relationship failures', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('one',NULL,'123','Alpha','Name','unknown','pending','member','hash');
    INSERT INTO users VALUES ('two',NULL,'123','alpha','Name','software','approved','member','hash');
    INSERT INTO users VALUES ('three',NULL,'25010720735','12345','Name','hardware','invalid','root','hash');
    INSERT INTO applications VALUES ('orphan','missing','pending','','2026-01-01',NULL);
    INSERT INTO applications VALUES ('mismatch','one','approved','','2026-01-01',NULL);
    INSERT INTO resources VALUES ('private','unknown','Title','Summary','unknown','DO_NOT_PRINT','2026-01-01');`)
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, false)
  for (const key of ['invalidStudentIds', 'duplicateStudentIds', 'duplicateUsernames']) assert.equal(report.checks[key].count, 2)
  for (const key of ['invalidUsernames', 'missingUserTeams', 'invalidUserStatuses', 'invalidRoles', 'orphanApplications', 'applicationStatusMismatch', 'missingResourceTeams', 'invalidResourceVisibility', 'duplicateEmails', 'unsupportedSourceSchema']) assert.equal(report.checks[key].count, key === 'invalidUsernames' || key === 'missingUserTeams' || key === 'invalidUserStatuses' || key === 'invalidRoles' || key === 'orphanApplications' || key === 'applicationStatusMismatch' || key === 'missingResourceTeams' || key === 'invalidResourceVisibility' ? 1 : 0)
  assert.equal(report.privacy.unclassifiedBodies, 1)
  assert.equal(JSON.stringify(report).includes('DO_NOT_PRINT'), false)
  assert.deepEqual(inspectLegacyDatabase(file), report)
})

test('normalized duplicate emails are blocked before import', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('one','Student@Example.org','25010720735','student_one','One','software','approved','member','hash');
    INSERT INTO users VALUES ('two','student@example.ORG','25010720736','student_two','Two','hardware','pending','member','hash');`)
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, false)
  assert.equal(report.checks.duplicateEmails.count, 2)
})

test('extended Node SQLite schemas are rejected instead of silently dropping newer records or state', t => {
  const { db, file } = fixture(t)
  db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE applications ADD COLUMN team TEXT;
    ALTER TABLE resources ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
    CREATE TABLE team_memberships (id TEXT PRIMARY KEY);
    CREATE TABLE resource_contents (id TEXT PRIMARY KEY);
    CREATE TABLE project_assets (id TEXT PRIMARY KEY);`)
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, false)
  assert.equal(report.checks.unsupportedSourceSchema.count, 6)
  assert.deepEqual(report.schema.unsupportedSourceExtensions, [
    'team_memberships', 'resource_contents', 'project_assets', 'users.is_active', 'applications.team', 'resources.status',
  ])
})

test('historical administrator without a usable login identity is blocked', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('admin-id',NULL,NULL,NULL,'Legacy Admin','software','approved','admin','hash');`)
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, false)
  assert.equal(report.checks.unusableAdminIdentities.count, 1)
})

test('oversized legacy user IDs are blocked before PocketBase import', t => {
  const { db, file } = fixture(t)
  db.prepare('INSERT INTO users VALUES (?,NULL,?,?,?,?,?,?,?)').run('x'.repeat(81), '25010720736', 'longid', 'Legacy Member', 'software', 'pending', 'member', 'hash')
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, false)
  assert.equal(report.checks.legacyUserIdsTooLong.count, 1)
})

test('PocketBase-incompatible legacy usernames are blocked before import', t => {
  const { db, file } = fixture(t)
  db.prepare('INSERT INTO users VALUES (?,NULL,?,?,?,?,?,?,?)').run('unicode-user', '25010720736', '张三', 'Legacy Member', 'software', 'pending', 'member', 'hash')
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, false)
  assert.equal(report.checks.invalidUsernames.count, 1)
})

test('PocketBase-compatible punctuation and 25-30 character usernames pass preflight', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('one',NULL,'25010720736','foo.bar','Member','software','approved','member','hash');
    INSERT INTO users VALUES ('two',NULL,'25010720737','longusername012345678901234','Member Two','hardware','pending','member','hash');`)
  db.close()
  const report = inspectLegacyDatabase(file)
  assert.equal(report.sourceDataChecksPassed, true)
  assert.equal(report.checks.invalidUsernames.count, 0)
})

test('older schema blocks without applying automatic schema migrations', t => {
  const { db, file } = fixture(t)
  db.exec('DROP TABLE users; CREATE TABLE users (id TEXT, email TEXT);')
  db.close()
  const before = readFileSync(file)
  const report = inspectLegacyDatabase(file)
  assert.ok(report.schema.users.missingColumns.includes('student_id'))
  assert.equal(report.sourceDataChecksPassed, undefined)
  assert.equal(report.readyForImport, false)
  assert.deepEqual(readFileSync(file), before)
})

test('CLI never creates absent sources and sanitizes errors', t => {
  const { db, file } = fixture(t)
  db.close()
  const absent = `${file}.missing`
  const result = spawnSync(process.execPath, ['scripts/migration-preflight.mjs', absent], { encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.equal(existsSync(absent), false)
  assert.equal(result.stderr.includes(absent), false)
  assert.equal(result.stdout, '')
})
