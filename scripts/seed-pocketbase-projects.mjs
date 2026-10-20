import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const url = String(process.env.POCKETBASE_URL || '').replace(/\/+$/, '')
const token = String(process.env.POCKETBASE_ADMIN_TOKEN || '')
const apply = process.argv.includes('--apply')
const sourcePath = path.resolve('public/projects/xiaoxueqi-2026/showcase-site/data.json')

function apiUrl(pathname) { return `${url}/api${pathname}` }
function sourceProjects() {
  const records = JSON.parse(readFileSync(sourcePath, 'utf8'))
  if (!Array.isArray(records)) throw new Error('Project source is not an array')
  return records
}
function payload(source, index) {
  return {
    legacy_id: String(source.id || '').trim(),
    edition: 'xiaoxueqi-2026',
    slug: `xiaoxueqi-2026-${String(source.id || `project-${index + 1}`).trim().toLowerCase()}`,
    group_label: String(source.group || '').trim(),
    category: ['hardware', 'software', 'game'].includes(source.category) ? source.category : 'software',
    category_label: String(source.categoryLabel || '').trim(),
    title: String(source.title || '').trim(),
    subtitle: String(source.subtitle || '').trim(),
    summary: String(source.summary || '').trim(),
    tags: Array.isArray(source.tags) ? source.tags : [],
    highlights: Array.isArray(source.highlights) ? source.highlights : [],
    outcomes: Array.isArray(source.outcomes) ? source.outcomes : [],
    tech: Array.isArray(source.tech) ? source.tech : [],
    members_text: String(source.members || '').trim(),
    media: Array.isArray(source.media) ? source.media : [],
    videos: Array.isArray(source.videos) ? source.videos : [],
    files: Array.isArray(source.files) ? source.files : [],
    accent: String(source.accent || 'cyan').trim(),
    sort_order: index,
    status: 'published',
  }
}
async function request(pathname, options = {}) {
  const response = await fetch(apiUrl(pathname), {
    ...options,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || `PocketBase request failed (${response.status})`)
  return body
}

export function seedRecords(records = sourceProjects()) {
  return records.map((record, index) => payload(record, index))
}

export async function seedProjects() {
  const records = seedRecords()
  const existing = await request('/collections/projects/records?perPage=200&sort=sort_order')
  const byLegacyId = new Map((existing.items || []).filter(item => item.legacy_id).map(item => [item.legacy_id, item]))
  const plan = records.map(record => ({ action: byLegacyId.has(record.legacy_id) ? 'update' : 'create', legacy_id: record.legacy_id, title: record.title }))
  if (!apply) return { mode: 'dry-run', records: plan.length, create: plan.filter(item => item.action === 'create').length, update: plan.filter(item => item.action === 'update').length }
  let created = 0
  let updated = 0
  for (const record of records) {
    const current = byLegacyId.get(record.legacy_id)
    if (current) {
      await request(`/collections/projects/records/${encodeURIComponent(current.id)}`, { method: 'PATCH', body: JSON.stringify(record) })
      updated += 1
    } else {
      await request('/collections/projects/records', { method: 'POST', body: JSON.stringify(record) })
      created += 1
    }
  }
  return { mode: 'apply', records: records.length, created, updated }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!url || !token) {
    process.stderr.write('POCKETBASE_URL and POCKETBASE_ADMIN_TOKEN are required.\n')
    process.exitCode = 2
  } else {
    try { process.stdout.write(`${JSON.stringify(await seedProjects())}\n`) } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
  }
}
