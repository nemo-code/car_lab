import assert from 'node:assert/strict'
import test from 'node:test'
import { seedRecords } from './seed-pocketbase-projects.mjs'

test('project seed preserves static showcase order and legacy media references', () => {
  const records = seedRecords()
  assert.equal(records.length, 9)
  assert.deepEqual(records.map(record => record.legacy_id), ['hw1', 'hw2', 'hw3', 'hw4', 'hw5', 'sw1', 'sw2', 'sw3', 'game'])
  assert.equal(records[0].slug, 'xiaoxueqi-2026-hw1')
  assert.equal(records[0].sort_order, 0)
  assert.equal(records[0].media[0], 'assets/硬件一组-slide-1.jpeg')
  assert.equal(records[0].videos[0].path, '../硬件一组/项目资料/演示视频.mp4')
  assert.equal(records[8].category, 'game')
})
