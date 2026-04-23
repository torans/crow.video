import test from 'node:test'
import assert from 'node:assert/strict'
import { pickVideoSegments } from './video-segment-picker.ts'

test('pickVideoSegments can reuse assets to satisfy long narration durations', async () => {
  const result = await pickVideoSegments({
    duration: 70,
    assets: [{ path: '/tmp/a.mp4', name: 'a' }],
    getDuration: async () => 2,
    randomChoice: (items) => items[0],
    randomFloat: (_min, max) => max,
  })

  const totalDuration = result.timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )

  assert.equal(result.videoFiles.length, 35)
  assert.ok(totalDuration >= 70)
})

test('pickVideoSegments rejects when every selected asset resolves to invalid duration', async () => {
  await assert.rejects(
    () =>
      pickVideoSegments({
        duration: 5,
        assets: [{ path: '/tmp/a.mp4', name: 'a' }],
        getDuration: async () => 0,
        randomChoice: (items) => items[0],
        randomFloat: (_min, max) => max,
      }),
    /Unable to assemble enough video segments from valid assets/,
  )
})
