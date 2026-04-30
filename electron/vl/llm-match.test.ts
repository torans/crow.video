import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVisualStagePlan,
  assembleSegments,
  classifySentenceStages,
  detectSentenceStage,
  inferCandidateStageHints,
  rankCandidatesForSentence,
  type CandidateClip,
} from './llm-match-core.ts'

test('detectSentenceStage preserves hook scene cta structure', () => {
  assert.equal(detectSentenceStage('还在担心抛不远吗', 0, 4), 'hook')
  assert.equal(detectSentenceStage('岸边实战抛投更顺', 2, 4), 'scene')
  assert.equal(detectSentenceStage('现在入手更省心', 3, 4), 'cta')
  assert.equal(detectSentenceStage('一卷能用好久，绝对是钓鱼必备神器', 4, 5), 'content')
})

test('classifySentenceStages creates scene in mid-late sentences', () => {
  const stages = classifySentenceStages([
    { text: '还在担心抛不远吗', start: 0, end: 2 },
    { text: '这款线极细顺滑', start: 2, end: 5 },
    { text: '岸边实战抛投手感特别顺', start: 5, end: 8 },
    { text: '现在安排一盘就够了', start: 8, end: 10 },
  ])
  assert.deepEqual(stages.map((item) => item.stage), ['hook', 'content', 'scene', 'cta'])
})

test('applyVisualStagePlan reserves product detail and result coverage', () => {
  const staged = applyVisualStagePlan([
    { text: '先看最狠的一下', start: 0, end: 2, stage: 'hook', index: 0 },
    { text: '平时出门带着也不占地方', start: 2, end: 4, stage: 'content', index: 1 },
    { text: '杯身拿在手里轻很多', start: 4, end: 6, stage: 'content', index: 2 },
    { text: '接口和刀头细节也看得见', start: 6, end: 8, stage: 'content', index: 3 },
    { text: '榨出来更细腻，喝着更顺', start: 8, end: 10, stage: 'content', index: 4 },
    { text: '现在下单更划算', start: 10, end: 12, stage: 'cta', index: 5 },
  ])

  assert.deepEqual(staged.map((item) => item.stage), ['hook', 'product', 'scene', 'detail', 'result', 'cta'])
})

test('rankCandidatesForSentence favors stage and duration fit', () => {
  const sentence = { text: '岸边实战抛投特别顺', start: 4, end: 6, stage: 'scene' as const, index: 2 }
  const ranked = rankCandidatesForSentence(
    sentence,
    [
      {
        videoPath: 'a.mp4',
        timestamp: 0,
        description: '岸边户外实战抛投镜头',
        tags: ['户外', '抛投'],
        relevance: 1,
        videoDur: 8,
        availableDuration: 3,
      },
      {
        videoPath: 'b.mp4',
        timestamp: 0,
        description: '产品静态特写展示',
        tags: ['特写'],
        relevance: 10,
        videoDur: 8,
        availableDuration: 3,
      },
    ] satisfies CandidateClip[],
    new Set<string>(),
  )

  assert.equal(ranked[0], 0)
})

test('rankCandidatesForSentence strongly prefers content clips for content sentences', () => {
  const sentence = { text: '极细线体搭配持久拉力', start: 1, end: 4, stage: 'content' as const, index: 1 }
  const ranked = rankCandidatesForSentence(
    sentence,
    [
      {
        videoPath: 'hook.mp4',
        timestamp: 0,
        description: '动态抛投爆发镜头',
        tags: ['抛投', '动态'],
        relevance: 20,
        videoDur: 6,
        availableDuration: 4,
      },
      {
        videoPath: 'content.mp4',
        timestamp: 0,
        description: '产品细节特写，线体极细，拉力展示',
        tags: ['细节', '线体', '拉力'],
        relevance: 5,
        videoDur: 6,
        availableDuration: 4,
      },
    ] satisfies CandidateClip[],
    new Set<string>(),
  )

  assert.equal(ranked[0], 1)
})

test('inferCandidateStageHints distinguishes detail product and result shots', () => {
  assert.deepEqual(
    inferCandidateStageHints({
      videoPath: 'detail.mp4',
      timestamp: 0,
      description: '产品细节特写，展示按键做工和接口材质',
      tags: ['细节', '特写', '产品'],
      relevance: 1,
    }),
    ['detail', 'product'],
  )

  assert.deepEqual(
    inferCandidateStageHints({
      videoPath: 'result.mp4',
      timestamp: 0,
      description: '使用后前后对比结果展示，效果一眼可见',
      tags: ['效果', '展示', '结果'],
      relevance: 1,
    }),
    ['product', 'result'],
  )
})

test('rankCandidatesForSentence prefers detail clip for detail sentence', () => {
  const sentence = { text: '近距离看下接口和边角做工细节', start: 3, end: 5, stage: 'detail' as const, index: 2 }
  const ranked = rankCandidatesForSentence(
    sentence,
    [
      {
        videoPath: 'scenario.mp4',
        timestamp: 0,
        description: '用户在厨房里真实使用产品',
        tags: ['厨房', '使用', '场景'],
        relevance: 8,
        videoDur: 6,
        availableDuration: 3,
      },
      {
        videoPath: 'detail.mp4',
        timestamp: 0,
        description: '产品细节特写，接口边角和材质清晰可见',
        tags: ['细节', '特写', '材质'],
        relevance: 3,
        videoDur: 6,
        availableDuration: 3,
      },
    ] satisfies CandidateClip[],
    new Set<string>(),
  )

  assert.equal(ranked[0], 1)
})

test('assembleSegments can split one sentence across multiple clips when one clip is too short', () => {
  const result = assembleSegments(
    [
      { text: '岸边实战抛投手感顺滑', start: 0, end: 3, stage: 'scene', index: 0 },
    ],
    [
      { stage: 'scene', rankedSegmentIndices: [0, 1] },
    ],
    [
      {
        videoPath: 'a.mp4',
        timestamp: 0,
        description: '岸边实战抛投',
        tags: ['岸边', '抛投'],
        relevance: 5,
        videoDur: 1.4,
        availableDuration: 1.4,
      },
      {
        videoPath: 'b.mp4',
        timestamp: 2,
        description: '户外作钓场景',
        tags: ['户外', '作钓'],
        relevance: 5,
        videoDur: 6,
        availableDuration: 4,
      },
    ],
  )

  const totalDuration = result.timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )

  assert.ok(result.videoFiles.length >= 1)
  assert.ok(totalDuration >= 2.9)
})

test('assembleSegments falls back to non-primary candidates to finish sentence coverage', () => {
  const result = assembleSegments(
    [{ text: '精准打到标点', start: 0, end: 4, stage: 'scene', index: 0 }],
    [{ stage: 'scene', rankedSegmentIndices: [0] }],
    [
      {
        videoPath: 'short.mp4',
        timestamp: 0,
        description: '岸边作钓短镜头',
        tags: ['岸边', '作钓'],
        relevance: 5,
        videoDur: 1.2,
        availableDuration: 1.2,
      },
      {
        videoPath: 'fallback.mp4',
        timestamp: 1,
        description: '户外水边实战场景',
        tags: ['户外', '水边', '实战'],
        relevance: 1,
        videoDur: 8,
        availableDuration: 5,
      },
    ],
  )

  const totalDuration = result.timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )

  assert.ok(result.videoFiles.includes('fallback.mp4'))
  assert.ok(totalDuration >= 3.9)
})

test('assembleSegments tail fill extends overall duration to target', () => {
  const result = assembleSegments(
    [
      { text: '看这线抛出去多顺', start: 0, end: 1, stage: 'hook', index: 0 },
      { text: '极细轻巧还结实', start: 1, end: 3, stage: 'content', index: 1 },
      { text: '岸边实战精准打点', start: 3, end: 6, stage: 'scene', index: 2 },
    ],
    [
      { stage: 'hook', rankedSegmentIndices: [0] },
      { stage: 'content', rankedSegmentIndices: [1] },
      { stage: 'scene', rankedSegmentIndices: [] },
    ],
    [
      {
        videoPath: 'hook.mp4',
        timestamp: 0,
        description: '动态抛投镜头',
        tags: ['抛投'],
        relevance: 5,
        videoDur: 1,
        availableDuration: 1,
      },
      {
        videoPath: 'content.mp4',
        timestamp: 0,
        description: '产品细节展示',
        tags: ['细节'],
        relevance: 5,
        videoDur: 2,
        availableDuration: 2,
      },
      {
        videoPath: 'tail.mp4',
        timestamp: 1,
        description: '户外岸边实战场景',
        tags: ['户外', '岸边'],
        relevance: 1,
        videoDur: 6,
        availableDuration: 4,
      },
    ],
  )

  const totalDuration = result.timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )

  assert.ok(totalDuration >= 5.9)
  assert.ok(result.videoFiles.includes('tail.mp4'))
})
