import { siteContent } from '../server/content.js'
import { pathToFileURL } from 'node:url'

const url = String(process.env.POCKETBASE_URL || '').replace(/\/+$/, '')
const token = String(process.env.POCKETBASE_ADMIN_TOKEN || '')
const apply = process.argv.includes('--apply')

function usage() {
  process.stderr.write('Usage: POCKETBASE_URL=https://host/pb POCKETBASE_ADMIN_TOKEN=<token> node scripts/seed-pocketbase-site.mjs [--apply]\n')
}

function apiUrl(path) {
  return `${url}/api${path}`
}

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || `PocketBase request failed (${response.status})`)
  return body
}

export function seedPayload() {
  return {
    key: 'site',
    title: '实验室官网内容',
    payload: siteContent,
    published: true,
  }
}

export async function seedSite() {
  const query = encodeURIComponent('key = "site"')
  const result = await request(`/collections/site_pages/records?filter=${query}&perPage=1`)
  const existing = result.items?.[0]
  const payload = JSON.stringify({ payload: seedPayload().payload })
  if (!apply) return { mode: 'dry-run', action: existing ? 'update' : 'create', bytes: Buffer.byteLength(payload), hasExisting: Boolean(existing) }
  const saved = await request('/lab/site-seed', {
    method: 'POST',
    body: payload,
  })
  return { mode: 'apply', action: existing ? 'update' : 'create', id: saved.id, sections: saved.sections }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!url || !token) {
    usage()
    process.exitCode = 2
  } else {
    try {
      const result = await seedSite()
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }
  }
}
