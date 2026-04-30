import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLlmCandidateKeywordPool,
  scoreCandidateForLlmPool,
  type CandidateClip,
} from './llm-match-core.ts'

test('buildLlmCandidateKeywordPool includes product keywords and visual structure keywords', () => {
  const pool = buildLlmCandidateKeywordPool(
    [{ text: '出门随手一放，喝的时候真方便', start: 0, end: 2 }],
    {
      name: '便携榨汁杯',
      features: '磁吸充电 轻便杯身',
      highlights: '果汁细腻 出门就能喝',
      targetAudience: '上班族',
    },
  )

  assert.equal(pool.has('便携榨汁杯'), true)
  assert.equal(pool.has('磁吸充电'), true)
  assert.equal(pool.has('细节'), true)
  assert.equal(pool.has('展示'), true)
})

test('scoreCandidateForLlmPool boosts product/detail candidates with product context', () => {
  const keywords = buildLlmCandidateKeywordPool(
    [{ text: '上班路上随手就能喝', start: 0, end: 2 }],
    {
      name: '便携榨汁杯',
      features: '磁吸充电 轻便杯身',
      highlights: '果汁细腻',
      targetAudience: '上班族',
    },
  )

  const productCandidate: CandidateClip = {
    videoPath: 'product.mp4',
    timestamp: 0,
    description: '便携榨汁杯产品展示，杯身细节和磁吸充电口特写',
    tags: ['产品', '展示', '细节'],
    relevance: 0,
  }
  const sceneCandidate: CandidateClip = {
    videoPath: 'scene.mp4',
    timestamp: 0,
    description: '女生在办公室路上喝饮料的场景',
    tags: ['场景', '通勤'],
    relevance: 0,
  }

  assert.ok(
    scoreCandidateForLlmPool(productCandidate, keywords) >
      scoreCandidateForLlmPool(sceneCandidate, keywords),
  )
})
