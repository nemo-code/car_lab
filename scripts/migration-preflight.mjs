import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const teams = ['software', 'hardware', 'simulation']
const statuses = ['pending', 'approved', 'rejected']
const required = {
  users: ['id', 'student_id', 'username', 'name', 'team', 'status', 'role'],
  applications: ['id', 'user_id', 'status', 'statement', 'created_at', 'reviewed_at'],
  resources: ['id', 'team', 'title', 'summary', 'visibility', 'body', 'created_at'],
}
const ref = (table, id) => createHash('sha256').update(`${table}:${id}`).digest('hex').slice(0, 16)
const distribution = (rows, field, allowed) => Object.fromEntries([...allowed, 'other'].map(value => [value,
  rows.filter(row => (allowed.includes(row[field]) ? row[field] : 'other') === value).length]))
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim().toLowerCase())
const validUsername = value => /^[a-z][a-z0-9_.-]{2,29}$/.test(String(value || '').trim().toLowerCase())

/** Reads a consistent SQLite snapshot. Never imports platform.js (which mutates schemas). */
export function inspectLegacyDatabase(filename) {
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    db.exec('PRAGMA query_only = ON; BEGIN;')
    const report = {
      formatVersion: 1, source: 'legacy-sqlite', mode: 'read-only-preflight',
      readyForImport: false, schema: {}, counts: {}, distributions: {}, checks: {},
      privacy: {
        output: 'Counts and pseudonymous record references only; no credentials, identities, statements or resource bodies.',
        bodyDestination: 'resource_contents.body', fileProtection: 'Protected + restrictive record viewRule required',
        summaryReviewRequired: true,
      },
      prerequisites: ['Lock and test the PocketBase version and collection rules.',
        'Choose and verify the legacy password reset strategy; never import old hashes as passwords.',
        'Verify backups, target mappings and rollback before separately authorized migration.'],
    }
    let missing = false
    for (const [table, columns] of Object.entries(required)) {
      const actual = db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name)
      const absent = columns.filter(column => !actual.includes(column))
      report.schema[table] = { exists: actual.length > 0, missingColumns: absent }
      missing ||= absent.length > 0
    }
    if (missing) return report
    // Explicit projections intentionally exclude hashes, tokens, names and private content.
    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(row => row.name))
    const applicationColumns = new Set(db.prepare('PRAGMA table_info(applications)').all().map(row => row.name))
    const resourceColumns = new Set(db.prepare('PRAGMA table_info(resources)').all().map(row => row.name))
    const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name))
    const unsupportedSourceExtensions = [
      ...['teams', 'team_memberships', 'resource_contents', 'projects', 'project_assets', 'announcements', 'site_pages', 'audit_logs']
        .filter(table => tableNames.has(table)),
      ...(userColumns.has('is_active') ? ['users.is_active'] : []),
      ...(applicationColumns.has('team') ? ['applications.team'] : []),
      ...(resourceColumns.has('status') ? ['resources.status'] : []),
    ]
    report.schema.unsupportedSourceExtensions = unsupportedSourceExtensions
    report.checks.unsupportedSourceSchema = { count: unsupportedSourceExtensions.length, refs: [] }
    const email = userColumns.has('email') ? 'email' : "'' AS email"
    const users = db.prepare(`SELECT id, student_id, username, ${email}, team, status, role FROM users`).all()
    const applications = db.prepare('SELECT id, user_id, status FROM applications').all()
    const resources = db.prepare('SELECT id, team, visibility, length(body) AS body_length FROM resources').all()
    const check = (name, table, rows) => { report.checks[name] = { count: rows.length, refs: rows.map(row => ref(table, row.id)).sort() } }
    const duplicateRows = (field, normalize) => {
      const groups = new Map()
      for (const row of users) {
        const key = normalize(row[field])
        if (!key) continue
        groups.set(key, [...(groups.get(key) || []), row])
      }
      return [...groups.values()].filter(group => group.length > 1).flat()
    }
    check('invalidStudentIds', 'users', users.filter(row => row.role !== 'admin' && !/^\d{11}$/.test(row.student_id || '')))
    check('legacyUserIdsTooLong', 'users', users.filter(row => String(row.id || '').trim().length > 80))
    check('duplicateStudentIds', 'users', duplicateRows('student_id', value => String(value || '').trim()))
    check('duplicateUsernames', 'users', duplicateRows('username', value => String(value || '').trim().toLowerCase()))
    check('duplicateEmails', 'users', duplicateRows('email', value => {
      const normalized = String(value || '').trim().toLowerCase()
      return validEmail(normalized) ? normalized : ''
    }))
    check('invalidUsernames', 'users', users.filter(row => row.username && !validUsername(row.username)))
    check('missingUserTeams', 'users', users.filter(row => !teams.includes(row.team)))
    check('invalidUserStatuses', 'users', users.filter(row => !statuses.includes(row.status)))
    check('invalidRoles', 'users', users.filter(row => !['admin', 'member'].includes(row.role)))
    check('unusableAdminIdentities', 'users', users.filter(row => row.role === 'admin' &&
      !/^\d{11}$/.test(String(row.student_id || '').trim()) &&
      !validUsername(row.username) && !validEmail(row.email)))
    const byId = new Map(users.map(row => [row.id, row]))
    check('orphanApplications', 'applications', applications.filter(row => !byId.has(row.user_id)))
    check('applicationStatusMismatch', 'applications', applications.filter(row => byId.has(row.user_id) && row.status !== byId.get(row.user_id).status))
    check('invalidApplicationStatuses', 'applications', applications.filter(row => !statuses.includes(row.status)))
    check('missingResourceTeams', 'resources', resources.filter(row => !teams.includes(row.team)))
    check('invalidResourceVisibility', 'resources', resources.filter(row => !['public', 'team'].includes(row.visibility)))
    report.counts = { users: users.length, applications: applications.length, resources: resources.length,
      configuredTeams: teams.length, referencedTeams: new Set([...users, ...resources].map(row => row.team).filter(value => teams.includes(value))).size }
    report.distributions = { userStatus: distribution(users, 'status', statuses), userTeam: distribution(users, 'team', teams),
      userRole: distribution(users, 'role', ['member', 'admin']), applicationStatus: distribution(applications, 'status', statuses),
      resourceVisibility: distribution(resources, 'visibility', ['public', 'team']) }
    report.privacy.publicBodies = resources.filter(row => row.visibility === 'public' && row.body_length > 0).length
    report.privacy.protectedBodies = resources.filter(row => row.visibility === 'team' && row.body_length > 0).length
    report.privacy.unclassifiedBodies = resources.filter(row => !['public', 'team'].includes(row.visibility) && row.body_length > 0).length
    report.sourceDataChecksPassed = Object.values(report.checks).every(check => check.count === 0)
    // Data checks alone never establish migration readiness or target access-control correctness.
    return report
  } finally {
    db.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2].startsWith('-')) {
    process.stderr.write('Usage: node scripts/migration-preflight.mjs /absolute/path/to/approved-sqlite-copy\n')
    process.exitCode = 2
  } else {
    try {
      const report = inspectLegacyDatabase(path.resolve(process.argv[2]))
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      process.exitCode = report.sourceDataChecksPassed ? 0 : 1
    } catch {
      // SQLite errors can contain source paths or values; keep command output sanitized.
      process.stderr.write('Preflight failed: source is missing, inaccessible, invalid or has an unsupported schema.\n')
      process.exitCode = 2
    }
  }
}
