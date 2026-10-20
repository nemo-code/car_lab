import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const router = readFileSync(new URL('../src/router/index.js', import.meta.url), 'utf8')
const siteApi = readFileSync(new URL('../src/api/site.js', import.meta.url), 'utf8')
const siteNode = readFileSync(new URL('../src/api/site-node.js', import.meta.url), 'utf8')
const server = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8')

test('contact compatibility route points to the supported application flow', () => {
  assert.match(router, /path: '\/contact'[\s\S]*redirect: '\/portal\?mode=apply'/)
  assert.doesNotMatch(router, /ContactPage/)
})

test('frontend site adapter has no dead contact or recruitment submission contract', () => {
  assert.doesNotMatch(siteApi, /submit(Contact|Recruitment)/)
  assert.doesNotMatch(siteNode, /submit(Contact|Recruitment)/)
  assert.doesNotMatch(server, /pathname === '\/api\/contact'/)
  assert.match(server, /pathname === '\/api\/recruitment'[\s\S]*sendJson\(res, 410,/)
})
