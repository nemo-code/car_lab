import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function runRollbackDrill() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'car-lab-rollback-'))
  const live = path.join(root, 'live')
  const backup = path.join(root, 'backup')
  const release = path.join(root, 'release')
  try {
    await Promise.all([live, backup, release].map(async dir => {
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, 'placeholder'), '')
    }))
    await writeFile(path.join(live, 'version.txt'), 'old\n')
    await cp(live, backup, { recursive: true })
    await writeFile(path.join(release, 'version.txt'), 'new\n')
    await cp(release, live, { recursive: true, force: true })
    assert.equal(await readFile(path.join(live, 'version.txt'), 'utf8'), 'new\n')

    // Simulate a failed health check and restore the previously captured release.
    await rm(live, { recursive: true, force: true })
    await cp(backup, live, { recursive: true })
    assert.equal(await readFile(path.join(live, 'version.txt'), 'utf8'), 'old\n')
    return { restored: true, dataPath: 'isolated temporary fixture' }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.stdout.write(`${JSON.stringify(await runRollbackDrill())}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
