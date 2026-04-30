import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FRAME_ANALYSIS_PROMPT_VERSION,
  shouldRefreshVideoAnalysis,
} from './analysis-version.ts'

test('shouldRefreshVideoAnalysis returns true when no prior frames exist', () => {
  assert.equal(shouldRefreshVideoAnalysis([], FRAME_ANALYSIS_PROMPT_VERSION), true)
})

test('shouldRefreshVideoAnalysis returns true for older prompt versions', () => {
  assert.equal(
    shouldRefreshVideoAnalysis([{ count: 12, analyzed_prompt_version: 1 }], FRAME_ANALYSIS_PROMPT_VERSION),
    true,
  )
})

test('shouldRefreshVideoAnalysis returns false for current prompt version', () => {
  assert.equal(
    shouldRefreshVideoAnalysis(
      [{ count: 12, analyzed_prompt_version: FRAME_ANALYSIS_PROMPT_VERSION }],
      FRAME_ANALYSIS_PROMPT_VERSION,
    ),
    false,
  )
})
