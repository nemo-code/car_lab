import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildMigrationPlan } from './migration-plan.mjs'

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-migration-plan-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'legacy.sqlite')
  const db = new DatabaseSync(file)
  db.exec(`CREATE TABLE users (id TEXT, email TEXT, student_id TEXT, username TEXT, name TEXT, team TEXT, status TEXT, role TEXT, password_hash TEXT);
    CREATE TABLE applications (id TEXT, user_id TEXT, status TEXT, statement TEXT, created_at TEXT, reviewed_at TEXT);
    CREATE TABLE resources (id TEXT, team TEXT, title TEXT, summary TEXT, visibility TEXT, body TEXT, created_at TEXT);
    CREATE TABLE sessions (token_hash TEXT, user_id TEXT, expires_at INTEGER);`)
  return { db, file }
}

test('valid source produces deterministic mappings without materializing private values', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('member-id',NULL,'25010720735','StudentName','Private Name','software','approved','member','SECRET_HASH');
    INSERT INTO users VALUES ('admin-id','admin@example.invalid',NULL,NULL,'Private Admin','hardware','approved','admin','ADMIN_HASH');
    INSERT INTO applications VALUES ('application-id','member-id','approved','SECRET_STATEMENT','2026-01-01',NULL);
    INSERT INTO resources VALUES ('resource-id','software','Title','Summary','team','SECRET_BODY','2026-01-01');
    INSERT INTO sessions VALUES ('SECRET_SESSION','member-id',9999999999);`)
  db.close()
  const before = readFileSync(file)
  const first = buildMigrationPlan(file)
  const second = buildMigrationPlan(file)
  assert.deepEqual(first, second)
  assert.equal(first.readyForImport, false)
  assert.equal(first.writesPerformed, 0)
  assert.equal(first.blockedByPreflight, false)
  assert.equal(first.mappingIssues, 0)
  assert.equal(first.relationIssues, 0)
  assert.equal(first.collections.users.records, 2)
  assert.equal(first.collections.applications.records, 1)
  assert.equal(first.collections.resources.records, 1)
  assert.equal(first.collections.resource_contents.records, 1)
  assert.equal(first.relations.applicationsUser.resolved, 1)
  assert.equal(first.relations.resourcesTeam.resolved, 1)
  assert.equal(first.relations.resourceContentsResource.resolved, 1)
  for (const value of ['25010720735', 'StudentName', 'Private Name', 'SECRET_HASH', 'SECRET_STATEMENT', 'SECRET_BODY', 'SECRET_SESSION', 'member-id']) {
    assert.equal(JSON.stringify(first).includes(value), false)
  }
  assert.deepEqual(readFileSync(file), before)
})

test('dirty source is blocked before mapping and reports only issue counts', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('one',NULL,'123','Alpha','Name','unknown','pending','member','hash');
    INSERT INTO users VALUES ('two',NULL,'123','alpha','Name','software','approved','member','hash');
    INSERT INTO applications VALUES ('orphan','missing','pending','PRIVATE_STATEMENT','2026-01-01',NULL);
    INSERT INTO resources VALUES ('private','unknown','Title','Summary','unknown','DO_NOT_PRINT','2026-01-01');`)
  db.close()
  const report = buildMigrationPlan(file)
  assert.equal(report.blockedByPreflight, true)
  assert.equal(report.collections.users.records, 0)
  assert.ok(report.issueCounts.duplicateStudentIds > 0)
  assert.equal(JSON.stringify(report).includes('PRIVATE_STATEMENT'), false)
  assert.equal(JSON.stringify(report).includes('DO_NOT_PRINT'), false)
})

test('empty legacy resource still receives a stable resource_contents mapping', t => {
  const { db, file } = fixture(t)
  db.exec(`INSERT INTO users VALUES ('admin-id','admin@example.invalid',NULL,NULL,'Private Admin','software','approved','admin','ADMIN_HASH');
    INSERT INTO resources VALUES ('empty-resource','software','Metadata only','Summary','public','', '2026-01-01');`)
  db.close()
  const report = buildMigrationPlan(file)
  assert.equal(report.blockedByPreflight, false)
  assert.equal(report.collections.resources.records, 1)
  assert.equal(report.collections.resource_contents.records, 1)
  assert.equal(report.relations.resourceContentsResource.resolved, 1)
  assert.equal(report.contentCounts.resourcesWithBodies, 0)
  assert.equal(report.contentCounts.resourcesWithoutBodies, 1)
})

test('CLI has sanitized errors and does not create a missing source', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-migration-cli-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const missing = path.join(dir, 'not-there.sqlite')
  const result = spawnSync(process.execPath, ['scripts/migration-plan.mjs', missing], { encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.equal(existsSync(missing), false)
  assert.equal(result.stderr.includes(missing), false)
  assert.equal(result.stdout, '')
})
