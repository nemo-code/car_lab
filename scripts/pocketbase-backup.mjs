import { createHash, randomBytes } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MANIFEST = 'manifest.json'

async function sha256File(filename) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filename)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported: ${path.relative(root, absolute)}`)
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute))
    else if (entry.isFile()) files.push(absolute)
    else throw new Error(`Unsupported backup entry: ${path.relative(root, absolute)}`)
  }
  return files.sort()
}

function relativeSafe(root, filename) {
  const relative = path.relative(root, filename)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Backup path escapes the selected root')
  return relative.split(path.sep).join('/')
}

async function buildManifest(root) {
  const files = await listFiles(root)
  const entries = []
  for (const filename of files) {
    const info = await stat(filename)
    entries.push({ path: relativeSafe(root, filename), bytes: info.size, sha256: await sha256File(filename) })
  }
  return {
    formatVersion: 1,
    type: 'pocketbase-data-backup',
    sourceStopped: true,
    createdAt: new Date().toISOString(),
    files: entries,
  }
}

export async function createPocketBaseBackup(source, destination, options = {}) {
  const sourceRoot = path.resolve(source)
  const destinationRoot = path.resolve(destination)
  if (!options.sourceStopped) throw new Error('源数据目录必须已停止写入；请传入 sourceStopped=true')
  const sourceInfo = await stat(sourceRoot).catch(() => null)
  if (!sourceInfo?.isDirectory()) throw new Error('源数据目录不存在')
  const relation = path.relative(sourceRoot, destinationRoot)
  if (relation && !relation.startsWith('..') && !path.isAbsolute(relation)) throw new Error('备份目录不能放在源数据目录内')
  await mkdir(path.dirname(destinationRoot), { recursive: true })
  await mkdir(destinationRoot, { recursive: false })
  await cp(sourceRoot, destinationRoot, { recursive: true, errorOnExist: true })
  const manifest = await buildManifest(destinationRoot)
  await writeFile(path.join(destinationRoot, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return { destination: destinationRoot, files: manifest.files.length, manifest }
}

function validateManifest(manifest) {
  if (!manifest || manifest.formatVersion !== 1 || manifest.type !== 'pocketbase-data-backup' || manifest.sourceStopped !== true || !Array.isArray(manifest.files)) {
    throw new Error('备份清单无效或缺少停止写入证据')
  }
  const seen = new Set()
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || seen.has(entry.path) || entry.path === MANIFEST || entry.path.startsWith('/') || entry.path.includes('..')) throw new Error('备份清单包含非法路径')
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('备份清单包含非法文件校验值')
    seen.add(entry.path)
  }
}

async function verifyBackup(root, manifest) {
  validateManifest(manifest)
  const listed = new Set(manifest.files.map(entry => entry.path))
  const actual = await listFiles(root)
  for (const filename of actual) {
    const relative = relativeSafe(root, filename)
    if (relative === MANIFEST) continue
    if (!listed.has(relative)) throw new Error(`备份包含未登记文件: ${relative}`)
  }
  for (const entry of manifest.files) {
    const filename = path.resolve(root, entry.path)
    if (relativeSafe(root, filename) !== entry.path) throw new Error('备份清单路径越界')
    const info = await stat(filename).catch(() => null)
    if (!info?.isFile() || info.size !== entry.bytes || await sha256File(filename) !== entry.sha256) throw new Error(`备份校验失败: ${entry.path}`)
  }
  return { files: manifest.files.length, createdAt: manifest.createdAt }
}

export async function restorePocketBaseBackup(backup, destination, options = {}) {
  const backupRoot = path.resolve(backup)
  const destinationRoot = path.resolve(destination)
  const manifest = JSON.parse(await readFile(path.join(backupRoot, MANIFEST), 'utf8'))
  await verifyBackup(backupRoot, manifest)
  const existing = await stat(destinationRoot).catch(() => null)
  if (existing && !options.replace) throw new Error('恢复目标已存在；需显式传入 replace=true')
  const staging = await mkdtemp(path.join(path.dirname(destinationRoot), '.pocketbase-restore-'))
  const previous = existing ? `${destinationRoot}.previous-${process.pid}-${randomBytes(6).toString('hex')}` : ''
  let movedExisting = false
  let movedStaging = false
  try {
    await cp(backupRoot, staging, { recursive: true })
    await rm(path.join(staging, MANIFEST))
    if (existing) {
      await rename(destinationRoot, previous)
      movedExisting = true
    }
    await rename(staging, destinationRoot)
    movedStaging = true
    if (previous) await rm(previous, { recursive: true, force: true })
    return { destination: destinationRoot, files: manifest.files.length, restoredFrom: manifest.createdAt }
  } catch (error) {
    if (!movedStaging) await rm(staging, { recursive: true, force: true })
    if (movedStaging) await rm(destinationRoot, { recursive: true, force: true })
    if (movedExisting) await rename(previous, destinationRoot).catch(() => {})
    throw error
  }
}

function parseArgs(argv) {
  const [command, source, destination] = argv
  return { command, source, destination, replace: argv.includes('--replace'), sourceStopped: argv.includes('--source-stopped') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { command, source, destination, replace, sourceStopped } = parseArgs(process.argv.slice(2))
  if (!['create', 'restore'].includes(command) || !source || !destination) {
    process.stderr.write('Usage: node scripts/pocketbase-backup.mjs create <pb_data> <backup_dir> --source-stopped\n       node scripts/pocketbase-backup.mjs restore <backup_dir> <pb_data> [--replace]\n')
    process.exitCode = 2
  } else {
    try {
      const result = command === 'create'
        ? await createPocketBaseBackup(source, destination, { sourceStopped })
        : await restorePocketBaseBackup(source, destination, { replace })
      process.stdout.write(`${JSON.stringify({ files: result.files, destination: result.destination })}\n`)
    } catch {
      process.stderr.write('PocketBase backup or restore failed. Check the data directory, stop-write evidence and manifest.\n')
      process.exitCode = 1
    }
  }
}
