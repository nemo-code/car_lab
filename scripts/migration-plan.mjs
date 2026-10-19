import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { inspectLegacyDatabase } from './migration-preflight.mjs'

export const configuredTeams = ['software', 'hardware', 'simulation']
export const collections = ['teams', 'users', 'team_memberships', 'applications', 'resources', 'resource_contents']

const hash = value => createHash('sha256').update(value).digest('hex')
export const sourceRef = (collection, legacyId) => hash(`car-lab:source:v1:${collection}:${legacyId}`).slice(0, 16)
// PocketBase custom IDs are limited to 15 characters. Keep the derivation stable so a rerun is idempotent.
export const targetId = (collection, legacyId) => hash(`car-lab:target:v1:${collection}:${legacyId}`).slice(0, 15)

function sanitizedIssueCounts(preflight) {
  return Object.fromEntries(Object.entries(preflight.checks || {}).map(([name, check]) => [name, check.count]))
}

function mapRows(collection, rows) {
  const sourceIds = new Map()
  const invalidSourceIds = []
  const duplicateSourceIds = []

  for (const row of rows) {
    const value = String(row.id ?? '').trim()
    if (!value) {
      invalidSourceIds.push(sourceRef(collection, `row-${invalidSourceIds.length}`))
      continue
    }
    if (sourceIds.has(value)) {
      duplicateSourceIds.push(sourceRef(collection, value))
      continue
    }
    sourceIds.set(value, targetId(collection, value))
  }

  const targetIds = new Map()
  const targetIdCollisions = []
  for (const [legacyId, id] of sourceIds) {
    const prior = targetIds.get(id)
    if (prior && prior !== legacyId) targetIdCollisions.push(id)
    else targetIds.set(id, legacyId)
  }

  const pairs = [...sourceIds.entries()]
    .filter(([legacyId, id]) => targetIds.get(id) === legacyId)
    .map(([legacyId, id]) => ({ sourceRef: sourceRef(collection, legacyId), targetId: id }))
    .sort((a, b) => a.sourceRef.localeCompare(b.sourceRef))

  return {
    records: rows.length,
    mapped: pairs.length,
    pairs,
    invalidSourceIds: [...new Set(invalidSourceIds)].sort(),
    duplicateSourceIds: [...new Set(duplicateSourceIds)].sort(),
    targetIdCollisions: [...new Set(targetIdCollisions)].sort(),
    mappingDigest: hash(pairs.map(pair => `${pair.sourceRef}:${pair.targetId}`).join('\n')),
    byLegacyId: sourceIds,
  }
}

function mapTeams() {
  const pairs = configuredTeams.map(code => ({ sourceRef: sourceRef('teams', code), targetId: targetId('teams', code), code }))
  return {
    records: configuredTeams.length,
    mapped: configuredTeams.length,
    pairs,
    mappingDigest: hash(pairs.map(pair => `${pair.sourceRef}:${pair.targetId}`).join('\n')),
    byCode: new Map(configuredTeams.map(code => [code, targetId('teams', code)])),
  }
}

function readSafeProjection(filename) {
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    db.exec('PRAGMA query_only = ON; BEGIN;')
    // These projections intentionally omit names, student IDs, usernames, email, hashes,
    // statements, bodies, tokens and session data. Counts and pseudonymous IDs are enough
    // to verify the shape of an import without moving private values into a dry-run report.
    const users = db.prepare('SELECT id, team, status, role FROM users').all()
    const applications = db.prepare('SELECT id, user_id, status FROM applications').all()
    const resources = db.prepare('SELECT id, team, visibility, length(body) AS body_length FROM resources').all()
    return { users, applications, resources }
  } finally {
    db.close()
  }
}

function relationSummary({ users, applications, resources, userMap, teamMap, resourceMap }) {
  const userRelations = applications.map(row => ({
    sourceRef: sourceRef('applications', row.id),
    userId: userMap.byLegacyId.get(String(row.user_id ?? '').trim()) || null,
  }))
  const resourceRelations = resources.map(row => ({
    sourceRef: sourceRef('resources', row.id),
    teamId: teamMap.byCode.get(row.team) || null,
  }))
  const contentRelations = resources.map(row => ({
    sourceRef: sourceRef('resource_contents', row.id),
    resourceId: resourceMap.byLegacyId.get(String(row.id ?? '').trim()) || null,
  }))

  const countMissing = (rows, field) => rows.filter(row => !row[field]).length
  return {
    applicationsUser: { records: userRelations.length, resolved: userRelations.length - countMissing(userRelations, 'userId'), missing: countMissing(userRelations, 'userId') },
    resourcesTeam: { records: resourceRelations.length, resolved: resourceRelations.length - countMissing(resourceRelations, 'teamId'), missing: countMissing(resourceRelations, 'teamId') },
    resourceContentsResource: { records: contentRelations.length, resolved: contentRelations.length - countMissing(contentRelations, 'resourceId'), missing: countMissing(contentRelations, 'resourceId') },
    applicationTeam: {
      records: applications.length,
      resolved: applications.filter(row => {
        const user = users.find(candidate => candidate.id === row.user_id)
        return user && teamMap.byCode.has(user.team)
      }).length,
      missing: applications.filter(row => {
        const user = users.find(candidate => candidate.id === row.user_id)
        return !user || !teamMap.byCode.has(user.team)
      }).length,
    },
  }
}

/**
 * Build a deterministic, read-only migration report.
 *
 * This is deliberately not an importer. Until a real PocketBase 0.40.5 instance and
 * its access rules are exercised, no target client, credentials or write callback is
 * accepted here. A future importer can consume the stable mapping pairs after the
 * isolated target and rollback gates are approved.
 */
export function buildMigrationPlan(filename) {
  const preflight = inspectLegacyDatabase(filename)
  const base = {
    formatVersion: 1,
    source: 'legacy-sqlite',
    mode: 'read-only-dry-run-plan',
    readyForImport: false,
    writesPerformed: 0,
    sourceDataChecksPassed: preflight.sourceDataChecksPassed === true,
    schema: preflight.schema,
    counts: preflight.counts || {},
    distributions: preflight.distributions || {},
    issueCounts: sanitizedIssueCounts(preflight),
    sensitiveDataPolicy: {
      passwordHashes: 'excluded; never imported as passwords',
      sessions: 'excluded; never carried across the cutover',
      identities: 'not materialized in the plan output',
      applicationStatements: 'not materialized until an authorized importer is implemented',
      resourceBodies: 'not materialized until Protected file/content rules pass isolated tests',
    },
    target: {
      engine: 'PocketBase',
      version: '0.40.5',
      status: 'isolated-verified-darwin_arm64',
      writeMode: 'disabled',
    },
  }

  if (preflight.sourceDataChecksPassed !== true) {
    return {
      ...base,
      blockedByPreflight: true,
      collections: Object.fromEntries(collections.map(name => [name, { records: 0, mapped: 0, pairs: [], mappingDigest: hash('') }])),
      relations: {},
      nextGate: 'Fix source schema/data findings, then rerun migration-preflight and this plan.',
    }
  }

  const { users, applications, resources } = readSafeProjection(filename)
  const teamMap = mapTeams()
  const userMap = mapRows('users', users)
  const applicationMap = mapRows('applications', applications)
  const resourceMap = mapRows('resources', resources)
  // The importer creates one resource_contents record for every legacy resource,
  // including entries whose body is empty, so metadata and later file attachment
  // replacement keep a stable one-to-one relation.
  const contentRows = resources.map(row => ({ id: row.id }))
  const contentMap = mapRows('resource_contents', contentRows)
  const membershipRows = users.map(row => ({ id: `${row.id}:${row.team}` }))
  const membershipMap = mapRows('team_memberships', membershipRows)

  const collectionsReport = {
    teams: { records: teamMap.records, mapped: teamMap.mapped, pairs: teamMap.pairs, mappingDigest: teamMap.mappingDigest },
    users: { records: userMap.records, mapped: userMap.mapped, pairs: userMap.pairs, mappingDigest: userMap.mappingDigest, invalidSourceIds: userMap.invalidSourceIds, duplicateSourceIds: userMap.duplicateSourceIds, targetIdCollisions: userMap.targetIdCollisions },
    team_memberships: { records: membershipMap.records, mapped: membershipMap.mapped, pairs: membershipMap.pairs, mappingDigest: membershipMap.mappingDigest, invalidSourceIds: membershipMap.invalidSourceIds, duplicateSourceIds: membershipMap.duplicateSourceIds, targetIdCollisions: membershipMap.targetIdCollisions },
    applications: { records: applicationMap.records, mapped: applicationMap.mapped, pairs: applicationMap.pairs, mappingDigest: applicationMap.mappingDigest, invalidSourceIds: applicationMap.invalidSourceIds, duplicateSourceIds: applicationMap.duplicateSourceIds, targetIdCollisions: applicationMap.targetIdCollisions },
    resources: { records: resourceMap.records, mapped: resourceMap.mapped, pairs: resourceMap.pairs, mappingDigest: resourceMap.mappingDigest, invalidSourceIds: resourceMap.invalidSourceIds, duplicateSourceIds: resourceMap.duplicateSourceIds, targetIdCollisions: resourceMap.targetIdCollisions },
    resource_contents: { records: contentMap.records, mapped: contentMap.mapped, pairs: contentMap.pairs, mappingDigest: contentMap.mappingDigest, invalidSourceIds: contentMap.invalidSourceIds, duplicateSourceIds: contentMap.duplicateSourceIds, targetIdCollisions: contentMap.targetIdCollisions },
  }
  const relations = relationSummary({ users, applications, resources, userMap, teamMap, resourceMap })
  const mappingIssues = Object.values(collectionsReport).reduce((sum, item) => sum + (item.invalidSourceIds?.length || 0) + (item.duplicateSourceIds?.length || 0) + (item.targetIdCollisions?.length || 0), 0)
  const relationIssues = Object.values(relations).reduce((sum, item) => sum + item.missing, 0)

  return {
    ...base,
    blockedByPreflight: false,
    mappingIssues,
    relationIssues,
    collections: collectionsReport,
    relations,
    contentCounts: {
      resourcesWithBodies: resources.filter(row => Number(row.body_length || 0) > 0).length,
      resourcesWithoutBodies: resources.filter(row => Number(row.body_length || 0) <= 0).length,
      publicResources: resources.filter(row => row.visibility === 'public').length,
      teamResources: resources.filter(row => row.visibility === 'team').length,
    },
    nextGate: mappingIssues || relationIssues
      ? 'Resolve deterministic mapping or relation findings before authorizing an importer.'
      : 'Run the isolated PocketBase 0.40.5 rule/rollback suite, then implement a separately authorized writer.',
  }
}

function usage() {
  process.stderr.write('Usage: node scripts/migration-plan.mjs /absolute/path/to/approved-sqlite-copy\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2].startsWith('-')) {
    usage()
    process.exitCode = 2
  } else {
    try {
      const report = buildMigrationPlan(path.resolve(process.argv[2]))
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
      process.exitCode = report.blockedByPreflight || report.mappingIssues || report.relationIssues ? 1 : 0
    } catch {
      // Avoid exposing source paths, SQL errors or accidental values in CLI output.
      process.stderr.write('Migration plan failed: source is missing, inaccessible, invalid or has an unsupported schema.\n')
      process.exitCode = 2
    }
  }
}
