import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseMatchingStrategy } from './video-matching-mode.ts'

test('chooseMatchingStrategy prefers llm when llm sync is enabled', () => {
  assert.equal(
    chooseMatchingStrategy({ llmSyncEnabled: true, smartMatchEnabled: true, hasCurrentProduct: true }),
    'llm',
  )
})

test('chooseMatchingStrategy falls back to smart match when llm sync is disabled', () => {
  assert.equal(
    chooseMatchingStrategy({ llmSyncEnabled: false, smartMatchEnabled: true, hasCurrentProduct: true }),
    'smart',
  )
})

test('chooseMatchingStrategy returns random when smart match cannot run', () => {
  assert.equal(
    chooseMatchingStrategy({ llmSyncEnabled: true, smartMatchEnabled: false, hasCurrentProduct: true }),
    'random',
  )
  assert.equal(
    chooseMatchingStrategy({ llmSyncEnabled: true, smartMatchEnabled: true, hasCurrentProduct: false }),
    'random',
  )
})
