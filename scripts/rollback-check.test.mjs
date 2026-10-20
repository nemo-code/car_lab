import test from 'node:test'
import assert from 'node:assert/strict'
import { runRollbackDrill } from './rollback-check.mjs'

test('rollback drill restores the previous release after a simulated failure', async () => {
  assert.deepEqual(await runRollbackDrill(), { restored: true, dataPath: 'isolated temporary fixture' })
})
