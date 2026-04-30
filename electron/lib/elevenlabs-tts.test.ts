import test from 'node:test'
import assert from 'node:assert/strict'
import { pickPreferredAlignment, supportsTimestamps, wrapCaptionText } from './elevenlabs-tts.ts'

test('supportsTimestamps rejects Eleven v3 and allows v2/flash models', () => {
  assert.equal(supportsTimestamps('eleven_v3'), false)
  assert.equal(supportsTimestamps('eleven_multilingual_v2'), true)
  assert.equal(supportsTimestamps('eleven_flash_v2_5'), true)
  assert.equal(supportsTimestamps(undefined), true)
})

test('pickPreferredAlignment keeps original Chinese alignment instead of pinyin normalized alignment', () => {
  const alignment = {
    characters: ['你', '好', '世', '界'],
    character_start_times_ms: [0, 200, 400, 600],
    character_end_times_ms: [180, 380, 580, 800],
  }
  const normalizedAlignment = {
    characters: ['n', 'i', ' ', 'h', 'a', 'o'],
    character_start_times_ms: [0, 80, 120, 200, 280, 360],
    character_end_times_ms: [70, 110, 180, 270, 350, 430],
  }

  assert.equal(
    pickPreferredAlignment(alignment, normalizedAlignment),
    alignment,
  )
})

test('wrapCaptionText inserts line breaks for long latin subtitles', () => {
  const wrapped = wrapCaptionText('this is a very long subtitle line with many latin letters', 1080, 56)
  assert.match(wrapped, /\\N/)
})
