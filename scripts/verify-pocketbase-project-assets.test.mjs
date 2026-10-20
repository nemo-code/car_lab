import test from 'node:test'
import assert from 'node:assert/strict'
import { assetPayload, assertFixedVersion, parsePocketBaseVersion, projectPayload } from './verify-pocketbase-project-assets.mjs'

test('project asset runtime verifier pins the PocketBase major release', () => {
  assert.equal(parsePocketBaseVersion('0.40.5'), '0.40.5')
  assert.equal(parsePocketBaseVersion('PocketBase v0.40.5'), '0.40.5')
  assert.throws(() => assertFixedVersion('0.41.0', '0.40.5'), /版本不匹配/)
})

test('project asset fixtures preserve legacy references and publication defaults', () => {
  const project = projectPayload()
  assert.equal(project.status, 'published')
  assert.equal(project.legacy_id, 'pb-project-assets-fixture')
  assert.deepEqual(project.media[0], { label: '历史图片引用', path: 'assets/software-1.jpg' })
  assert.equal(project.videos[0].path, '../missing/legacy-fixture.mp4')

  const asset = assetPayload()
  assert.equal(asset.source_type, 'legacy')
  assert.equal(asset.availability, 'available')
  assert.equal(asset.published, true)
  assert.equal(asset.legacy_path, 'assets/software-1.jpg')
})
