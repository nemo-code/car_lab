import { pathToFileURL } from 'node:url'
import path from 'node:path'

const base = String(process.env.POCKETBASE_URL || '').replace(/\/+$/, '')
// Controlled resource routes require a business administrator from `users`.
// A PocketBase `_superusers` token is intentionally not accepted here.
const token = String(process.env.POCKETBASE_BUSINESS_TOKEN || '')

async function request(pathname, options = {}) {
  const response = await fetch(`${base}/api${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

async function createResource(team, title) {
  const response = await request('/lab/resources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team, title, summary: 'FILE-02 fixture', visibility: 'public', body: 'fixture', filename: 'fixture.pdf', size: 0 }),
  })
  if (response.status !== 201) throw new Error('resource create failed')
  return response.payload.resource.id
}

async function upload(resourceId, filename, mime, bytes) {
  const form = new FormData()
  form.set('resource', resourceId)
  form.set('body', 'fixture')
  form.set('filename', filename)
  form.set('size', String(bytes.length))
  form.append('file', new Blob([bytes], { type: mime }), filename)
  return request(`/lab/resources/${encodeURIComponent(resourceId)}/file`, { method: 'POST', body: form })
}

export async function verifyFiles() {
  if (!base || !token) throw new Error('POCKETBASE_URL and POCKETBASE_BUSINESS_TOKEN are required (use a users.role=admin token, not a superuser token)')
  const teams = await request('/collections/teams/records?filter=code%20%3D%20%22software%22&perPage=1')
  const team = teams.payload.items?.[0]?.id
  if (!team) throw new Error('software team not found')
  const stamp = Date.now()
  const validResource = await createResource(team, `FILE-02 valid ${stamp}`)
  const invalidResource = await createResource(team, `FILE-02 invalid ${stamp}`)
  const oversizedResource = await createResource(team, `FILE-02 oversized ${stamp}`)
  const valid = await upload(validResource, 'fixture.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n'))
  const invalidMime = await upload(invalidResource, 'fixture.html', 'text/html', Buffer.from('<p>invalid</p>'))
  const oversized = await upload(oversizedResource, 'fixture.pdf', 'application/pdf', Buffer.alloc(30 * 1024 * 1024 + 1))
  for (const id of [validResource, invalidResource, oversizedResource]) {
    await request(`/lab/resources/${encodeURIComponent(id)}/offline`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  }
  return {
    valid: { status: valid.status, fileStored: Boolean(valid.payload.file) },
    invalidMime: { status: invalidMime.status },
    oversized: { status: oversized.status },
    pass: valid.status === 200 && Boolean(valid.payload.file) && invalidMime.status === 400 && oversized.status === 400,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifyFiles()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.pass ? 0 : 1
  } catch {
    process.stderr.write('PocketBase file verification failed.\n')
    process.exitCode = 2
  }
}
