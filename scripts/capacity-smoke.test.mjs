import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { capacityConfig, runCapacitySmoke } from './capacity-smoke.mjs'

test('capacity smoke exercises a loopback service with bounded concurrency', async () => {
  let requestCount = 0
  let active = 0
  let maxActive = 0
  const server = http.createServer((request, response) => {
    requestCount += 1
    active += 1
    maxActive = Math.max(maxActive, active)
    setTimeout(() => {
      active -= 1
      response.writeHead(['/api/health', '/api/teams'].includes(request.url) ? 200 : 404, { 'Content-Type': 'application/json' })
      response.end('{}')
    }, 2)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  try {
    const result = await runCapacitySmoke({
      baseUrl: `http://127.0.0.1:${address.port}`,
      requests: 16,
      concurrency: 4,
      routes: ['/api/health', '/api/teams'],
      timeoutMs: 1000,
    })
    assert.equal(result.pass, true)
    assert.equal(result.requests, 16)
    assert.equal(requestCount, 16)
    assert.ok(maxActive <= 4)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

test('capacity smoke refuses remote targets unless explicitly enabled', () => {
  assert.throws(() => capacityConfig({ baseUrl: 'https://example.com' }), /回环地址/)
})
