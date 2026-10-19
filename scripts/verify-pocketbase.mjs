import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const versionFile = path.resolve('pocketbase/version.json')
const platformKey = `${os.platform()}_${os.arch()}`

export function sha256File(filename) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filename)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export async function verifyPocketBaseReleaseAsset(filename, metadata = JSON.parse(readFileSync(versionFile, 'utf8'))) {
  const expected = metadata.releaseAssetChecksums?.[platformKey]
  if (!expected) throw new Error(`No checksum recorded for ${platformKey}`)
  const actual = await sha256File(filename)
  if (actual !== expected) throw new Error(`PocketBase release asset checksum mismatch for ${platformKey}`)
  return { version: metadata.version, platform: platformKey, assetSha256: actual }
}

export async function verifyPocketBaseBinary(filename, metadata = JSON.parse(readFileSync(versionFile, 'utf8'))) {
  const expected = metadata.binarySha256ByPlatform?.[platformKey]
    || (metadata.binaryPlatform === platformKey ? metadata.binarySha256 : '')
  if (!expected) throw new Error(`No verified PocketBase binary checksum recorded for ${platformKey}`)
  const actual = await sha256File(filename)
  if (actual !== expected) throw new Error(`PocketBase binary checksum mismatch for ${platformKey}`)
  return { version: metadata.version, platform: platformKey, binarySha256: actual }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2].startsWith('-')) {
    process.stderr.write('Usage: node scripts/verify-pocketbase.mjs /absolute/path/to/pocketbase-release-asset.zip\n')
    process.exitCode = 2
  } else {
    try {
      const result = await verifyPocketBaseReleaseAsset(path.resolve(process.argv[2]))
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      process.exitCode = 1
    }
  }
}
