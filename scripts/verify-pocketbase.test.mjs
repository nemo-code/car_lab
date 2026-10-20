import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { sha256File, verifyPocketBaseBinary, verifyPocketBaseReleaseAsset } from './verify-pocketbase.mjs'

test('PocketBase release asset verifier accepts the recorded digest and rejects a mismatch', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pb-verify-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'pocketbase.zip')
  const bytes = Buffer.from('isolated-pocketbase-fixture')
  writeFileSync(file, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  assert.equal(await sha256File(file), digest)
  const metadata = { version: '0.40.5', releaseAssetChecksums: { [`${process.platform}_${process.arch}`]: digest } }
  assert.deepEqual(await verifyPocketBaseReleaseAsset(file, metadata), { version: '0.40.5', platform: `${process.platform}_${process.arch}`, assetSha256: digest })
  await assert.rejects(() => verifyPocketBaseReleaseAsset(file, { ...metadata, releaseAssetChecksums: { [`${process.platform}_${process.arch}`]: '0'.repeat(64) } }), /release asset checksum mismatch/)
})

test('PocketBase binary verifier binds the executable digest to its verified platform', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pb-binary-verify-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'pocketbase')
  const bytes = Buffer.from('isolated-pocketbase-binary-fixture')
  writeFileSync(file, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const platform = `${process.platform}_${process.arch}`
  const metadata = { version: '0.40.5', binaryPlatform: platform, binarySha256: digest }
  assert.deepEqual(await verifyPocketBaseBinary(file, metadata), { version: '0.40.5', platform, binarySha256: digest })
  await assert.rejects(() => verifyPocketBaseBinary(file, { ...metadata, binarySha256: '0'.repeat(64) }), /binary checksum mismatch/)
  await assert.rejects(() => verifyPocketBaseBinary(file, { ...metadata, binaryPlatform: 'unverified_platform' }), /No verified PocketBase binary checksum/)
})

test('PocketBase binary verifier accepts a recorded digest for a secondary platform', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pb-binary-platform-map-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'pocketbase')
  const bytes = Buffer.from('secondary-platform-pocketbase-binary-fixture')
  writeFileSync(file, bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  const platform = `${process.platform}_${process.arch}`
  const metadata = { version: '0.40.5', binaryPlatform: 'unverified_platform', binarySha256: '0'.repeat(64), binarySha256ByPlatform: { [platform]: digest } }
  assert.deepEqual(await verifyPocketBaseBinary(file, metadata), { version: '0.40.5', platform, binarySha256: digest })
})
