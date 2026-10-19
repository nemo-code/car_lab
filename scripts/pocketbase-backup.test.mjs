import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createPocketBaseBackup, restorePocketBaseBackup } from './pocketbase-backup.mjs'

test('PocketBase backup verifies an offline snapshot before restoring it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'car-lab-backup-'))
  const source = path.join(root, 'pb_data')
  const backup = path.join(root, 'backups', 'snapshot')
  const restored = path.join(root, 'restored')
  try {
    await mkdir(path.join(source, 'storage'), { recursive: true })
    await writeFile(path.join(source, 'data.db'), 'sqlite fixture\n')
    await writeFile(path.join(source, 'storage', 'file.pdf'), '%PDF-1.4\n')
    await assert.rejects(() => createPocketBaseBackup(source, backup), /停止写入/)
    const result = await createPocketBaseBackup(source, backup, { sourceStopped: true })
    assert.equal(result.files, 2)
    assert.equal(JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8')).sourceStopped, true)
    await restorePocketBaseBackup(backup, restored)
    assert.equal(await readFile(path.join(restored, 'data.db'), 'utf8'), 'sqlite fixture\n')
    assert.equal(await readFile(path.join(restored, 'storage', 'file.pdf'), 'utf8'), '%PDF-1.4\n')
    await writeFile(path.join(backup, 'data.db'), 'tampered\n')
    await assert.rejects(() => restorePocketBaseBackup(backup, path.join(root, 'tampered-restore')), /备份校验失败/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
