import assert from 'node:assert/strict'
import test from 'node:test'
import { siteContent } from './content.js'
import { validateSitePayload, validateSitePayloadSize, validateSiteSection } from './site-content-contract.js'

test('the seeded site payload satisfies the shared Node and PocketBase contract', () => {
  assert.equal(validateSitePayload(siteContent), siteContent)
  assert.equal(validateSitePayloadSize(siteContent), undefined)
})

test('site sections reject missing structures, unsupported fields, and unsafe links', () => {
  assert.throws(() => validateSiteSection('home', {}), /home\.hero/)
  assert.throws(() => validateSiteSection('home', { ...siteContent.home, hero: { ...siteContent.home.hero, image: 'javascript:alert(1)' } }), /安全|资源路径/)
  assert.throws(() => validateSiteSection('navigation', [{ path: '//attacker.example', label: '外链' }]), /站内路径/)
  assert.throws(() => validateSiteSection('navigation', [{ path: '/contact', label: '联系', unexpected: true }]), /不受支持/)
  assert.throws(() => validateSiteSection('missing', {}), /区块无效/)
})

test('payload size uses UTF-8 bytes so the limit matches PocketBase storage', () => {
  assert.throws(() => validateSitePayloadSize({ value: '界'.repeat(40000) }), /100 KB/)
})
