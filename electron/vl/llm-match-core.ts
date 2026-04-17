import { createHash } from 'node:crypto'
import path from 'node:path'

export interface Sentence {
  text: string
  start: number
  end: number
}

export type SegmentStage = 'hook' | 'content' | 'scene' | 'cta'

export interface CandidateClip {
  videoPath: string
  timestamp: number
  description: string
  tags: string[]
  relevance: number
  videoDur?: number
  availableDuration?: number
}

export interface StageSentence extends Sentence {
  stage: SegmentStage
  index: number
}

export interface RankedSentenceSelection {
  stage: SegmentStage
  rankedSegmentIndices: number[]
  reason?: string
}

export interface ProductInfo {
  name?: string
  features?: string
  highlights?: string
  targetAudience?: string
}

const STAGE_KEYWORDS: Record<SegmentStage, string[]> = {
  hook: ['抛投', '瞬间', '特写', '动态', '冲击', '爆发', '甩杆', '手感', '直接', '一出手'],
  content: ['细节', '参数', '线径', '顺滑', '拉力', '性能', '材质', '工艺', '不吸水', '耐磨'],
  scene: ['野钓', '路亚', '水面', '户外', '岸边', '实战', '使用', '场景', '作钓', '抛竿'],
  cta: ['展示', '成果', '收获', '上鱼', '大鱼', '成就', '入手', '闭眼冲', '安排', '带回去'],
}

const CTA_HINTS = [
  '下单',
  '入手',
  '安排',
  '闭眼冲',
  '试试',
  '带走',
  '现在',
  '备一卷',
  '带上',
  '上链接',
]
const SCENE_HINTS = [
  '野钓',
  '路亚',
  '户外',
  '水面',
  '岸边',
  '实战',
  '使用',
  '场景',
  '作钓',
  '上手',
  '出门',
]

function isSceneText(text: string): boolean {
  return SCENE_HINTS.some((keyword) => text.includes(keyword))
}

function isCtaText(text: string): boolean {
  return CTA_HINTS.some((keyword) => text.includes(keyword))
}

export function detectSentenceStage(text: string, index: number, total: number): SegmentStage {
  const normalized = text.trim()

  // 短视频（带货类）必须符合 Hook（黄金 3 秒）+ Content（产品价值）+ CTA（转化引导）

  // 1. Hook (黄金 3 秒) 一般是第 1 句（甚至前两句）
  if (index === 0) return 'hook'
  if (index === 1 && total > 3 && !isCtaText(normalized)) return 'hook'

  // 3. CTA (转化引导) 一般是最后 1 句或带有明显引导词的末尾部分
  if (index === total - 1) return 'cta'
  if (index >= total - 3 && isCtaText(normalized)) return 'cta'

  // 2. Content (产品价值) 中间绝大部分内容
  if (isSceneText(normalized)) return 'scene'
  return 'content'
}

export function classifySentenceStages(sentences: Sentence[]): StageSentence[] {
  const total = sentences.length
  return sentences.map((sentence, index) => ({
    ...sentence,
    index,
    stage: detectSentenceStage(sentence.text, index, total),
  }))
}

export function inferCandidateStageHints(candidate: CandidateClip): SegmentStage[] {
  const searchable = `${candidate.description} ${candidate.tags.join(' ')}`.toLowerCase()
  const hints = new Set<SegmentStage>()

  ;(Object.keys(STAGE_KEYWORDS) as SegmentStage[]).forEach((stage) => {
    if (STAGE_KEYWORDS[stage].some((keyword) => searchable.includes(keyword.toLowerCase()))) {
      hints.add(stage)
    }
  })

  if (hints.size === 0) hints.add('content')
  return [...hints]
}

// 匹配分值
function getStageMatchScore(sentenceStage: SegmentStage, candidateHints: SegmentStage[]): number {
  const hasSameStage = candidateHints.includes(sentenceStage)
  const hasContent = candidateHints.includes('content')
  const hasHook = candidateHints.includes('hook')
  const hasScene = candidateHints.includes('scene')
  const hasCta = candidateHints.includes('cta')

  switch (sentenceStage) {
    case 'hook':
      // Hook（黄金3秒）必须强视觉冲击，给予最高优先级
      if (hasHook) return 80
      if (hasScene) return 15 // 场景素材可以作为次选
      if (hasContent) return -40 // 产品细节绝不能做开头
      return -50
    case 'content':
      // Content（产品价值）占比最大，优先匹配 content 素材
      if (hasContent) return 55
      if (hasHook || hasScene || hasCta) return -35
      return -10
    case 'scene':
      if (hasSameStage) return 45
      if (hasContent) return 0
      return -30
    case 'cta':
      if (hasSameStage) return 45
      if (hasContent) return 0
      return -30
  }
}

export function extractKeywords(text: string): string[] {
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) || []
  const english = text.match(/[a-zA-Z]{3,}/g) || []
  return [...chinese, ...english]
}

export function rankCandidatesForSentence(
  sentence: StageSentence,
  candidates: CandidateClip[],
  usedVideos: Set<string>,
  productInfo?: ProductInfo,
  requiredDuration?: number,
): number[] {
  const sentenceDuration = requiredDuration || sentence.end - sentence.start
  const keywords = extractKeywords(sentence.text)
  const productKeywords = extractKeywords(
    [productInfo?.name || '', productInfo?.features || '', productInfo?.highlights || ''].join(' '),
  )

  return candidates
    .map((candidate, index) => {
      const searchable = `${candidate.description} ${candidate.tags.join(' ')}`.toLowerCase()
      let score = candidate.relevance

      const stageHints = inferCandidateStageHints(candidate)
      score += getStageMatchScore(sentence.stage, stageHints)

      keywords.forEach((keyword) => {
        if (searchable.includes(keyword.toLowerCase())) score += 8
      })
      productKeywords.forEach((keyword) => {
        if (searchable.includes(keyword.toLowerCase())) score += 3
      })

      const available = candidate.availableDuration || 0
      if (available >= sentenceDuration) score += 15
      else score += available * 4 - (sentenceDuration - available) * 10

      if (!usedVideos.has(candidate.videoPath)) score += 6

      return { index, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index)
}

function dedupeIndices(indices: number[]): number[] {
  return [...new Set(indices)]
}

function createSeededRandom(seed: string) {
  let state = Number.parseInt(createHash('md5').update(seed).digest('hex').slice(0, 8), 16) || 1

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function chooseIndexWithVariation(
  rankedIndices: number[],
  candidates: CandidateClip[],
  sentence: StageSentence,
  random: () => number,
  usedVideos: Set<string>,
): number | null {
  const top = rankedIndices.slice(0, 5)
  if (top.length === 0) return null

  const sentenceDuration = sentence.end - sentence.start
  const weighted = top.map((index, order) => {
    const candidate = candidates[index]
    const available = candidate.availableDuration || 0
    let weight = Math.max(1, 20 - order * 3)
    if (available >= sentenceDuration) weight += 12
    if (!usedVideos.has(candidate.videoPath)) weight += 6
    return { index, weight }
  })

  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let cursor = random() * total
  for (const item of weighted) {
    cursor -= item.weight
    if (cursor <= 0) return item.index
  }
  return weighted[0]?.index ?? null
}

function overlaps(ranges: Array<[number, number]>, start: number, end: number): boolean {
  return ranges.some(([s, e]) => start < e && end > s)
}

function findAvailableWindow(
  ranges: Array<[number, number]>,
  clipStart: number,
  clipEnd: number,
  desiredDuration: number,
): [number, number] | null {
  if (clipEnd <= clipStart || desiredDuration <= 0) return null

  const sorted = [...ranges]
    .filter(([start, end]) => end > clipStart && start < clipEnd)
    .sort((a, b) => a[0] - b[0])

  let cursor = clipStart
  for (const [start, end] of sorted) {
    if (start > cursor) {
      const gapEnd = Math.min(start, clipEnd)
      if (gapEnd - cursor > 0.12) {
        return [cursor, Math.min(cursor + desiredDuration, gapEnd)]
      }
    }
    cursor = Math.max(cursor, end)
    if (clipEnd - cursor <= 0.12) return null
  }

  if (clipEnd - cursor > 0.12) {
    return [cursor, Math.min(cursor + desiredDuration, clipEnd)]
  }

  return null
}

function buildCoverageFallbackRanked(
  sentence: StageSentence,
  candidates: CandidateClip[],
  usedRanges: Map<string, Array<[number, number]>>,
): number[] {
  return candidates
    .map((candidate, index) => {
      const existingRanges = usedRanges.get(candidate.videoPath) || []
      const clipEnd = candidate.timestamp + (candidate.availableDuration || 0)
      const stageHints = inferCandidateStageHints(candidate)
      let score = candidate.availableDuration || 0

      score += getStageMatchScore(sentence.stage, stageHints) * 3
      if (overlaps(existingRanges, candidate.timestamp, clipEnd)) score -= 1000

      return { index, score }
    })
    .filter((item) => item.score > -500)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index)
}

function getCurrentAssembledDuration(timeRanges: [string, string][]): number {
  return timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )
}

function buildTailFillRanked(candidates: CandidateClip[]): number[] {
  return candidates
    .map((candidate, index) => {
      // tail-fill 阶段：重叠的片段也保留（允许复用同一视频的不同时间位置）
      let score = candidate.availableDuration || 0
      return { index, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index)
}

export function assembleSegments(
  stageSentences: StageSentence[],
  llmResult: RankedSentenceSelection[],
  candidates: CandidateClip[],
  productInfo?: ProductInfo,
  totalAudioDuration?: number,
): { videoFiles: string[]; timeRanges: [string, string][] } {
  const videoFiles: string[] = []
  const timeRanges: [string, string][] = []
  const usedRanges = new Map<string, Array<[number, number]>>()
  const usedVideos = new Set<string>()
  const random = createSeededRandom(
    `${stageSentences.map((sentence) => `${sentence.stage}:${sentence.text}`).join('|')}|${productInfo?.name || ''}|${productInfo?.features || ''}`,
  )

  stageSentences.forEach((sentence, index) => {
    const segmentStartTime = index === 0 ? 0 : sentence.start
    let segmentEndTime = sentence.end
    if (index < stageSentences.length - 1) {
      segmentEndTime = stageSentences[index + 1].start
    } else if (totalAudioDuration && totalAudioDuration > segmentStartTime) {
      segmentEndTime = totalAudioDuration
    }

    let remaining = segmentEndTime - segmentStartTime
    const llmRanked = llmResult[index]?.rankedSegmentIndices || []
    const heuristicRanked = rankCandidatesForSentence(
      sentence,
      candidates,
      usedVideos,
      productInfo,
      remaining,
    )
    let ranked = dedupeIndices([...llmRanked, ...heuristicRanked])

    while (remaining > 0.12 && ranked.length > 0) {
      const chosenIndex = chooseIndexWithVariation(ranked, candidates, sentence, random, usedVideos)
      if (chosenIndex === null) break

      const candidate = candidates[chosenIndex]
      const videoDur = candidate.videoDur || 15
      const clipStart = candidate.timestamp
      const clipEnd = Math.min(videoDur, clipStart + (candidate.availableDuration || 0))
      const existingRanges = usedRanges.get(candidate.videoPath) || []
      const window = findAvailableWindow(existingRanges, clipStart, clipEnd, remaining)

      ranked = ranked.filter((value) => value !== chosenIndex)

      if (!window) continue
      const [trimStart, safeEnd] = window
      const clipDuration = safeEnd - trimStart

      existingRanges.push([trimStart, safeEnd])
      usedRanges.set(candidate.videoPath, existingRanges)
      usedVideos.add(candidate.videoPath)

      console.log(
        `[assemble] [${index}] stage=${sentence.stage} ${path.basename(candidate.videoPath)} raw_ts=${candidate.timestamp} videoDur=${videoDur} remain=${remaining.toFixed(3)} → trim=${trimStart}-${safeEnd.toFixed(3)}`,
      )

      videoFiles.push(candidate.videoPath)
      timeRanges.push([trimStart.toFixed(3), safeEnd.toFixed(3)])
      remaining -= clipDuration
    }

    if (remaining > 0.12) {
      let coverageRanked = buildCoverageFallbackRanked(sentence, candidates, usedRanges)
      while (remaining > 0.12 && coverageRanked.length > 0) {
        const chosenIndex = coverageRanked.shift()
        if (chosenIndex === undefined) break

        const candidate = candidates[chosenIndex]
        const videoDur = candidate.videoDur || 15
        const clipStart = candidate.timestamp
        const clipEnd = Math.min(videoDur, clipStart + (candidate.availableDuration || 0))
        const existingRanges = usedRanges.get(candidate.videoPath) || []
        const window = findAvailableWindow(existingRanges, clipStart, clipEnd, remaining)

        if (!window) continue
        const [trimStart, safeEnd] = window
        const clipDuration = safeEnd - trimStart

        existingRanges.push([trimStart, safeEnd])
        usedRanges.set(candidate.videoPath, existingRanges)

        console.log(
          `[assemble-fallback] [${index}] stage=${sentence.stage} ${path.basename(candidate.videoPath)} raw_ts=${candidate.timestamp} videoDur=${videoDur} remain=${remaining.toFixed(3)} → trim=${trimStart}-${safeEnd.toFixed(3)}`,
        )

        videoFiles.push(candidate.videoPath)
        timeRanges.push([trimStart.toFixed(3), safeEnd.toFixed(3)])
        remaining -= clipDuration
      }
    }

    if (remaining > 0.12) {
      // 强制重复挑选候选来填补本句剩余时长，无视重叠
      let forceRanked = [...candidates].sort((a, b) => {
        const aScore =
          getStageMatchScore(sentence.stage, inferCandidateStageHints(a)) * 2 +
          (a.availableDuration || 0)
        const bScore =
          getStageMatchScore(sentence.stage, inferCandidateStageHints(b)) * 2 +
          (b.availableDuration || 0)
        return bScore - aScore
      })

      while (remaining > 0.12 && forceRanked.length > 0) {
        const candidate = forceRanked.shift()!
        const clipStart = candidate.timestamp
        const available = candidate.availableDuration || (candidate.videoDur || 15) - clipStart
        const sliceDuration = Math.min(available, remaining)
        if (sliceDuration <= 0.05) continue

        const safeEnd = clipStart + sliceDuration

        const existingRanges = usedRanges.get(candidate.videoPath) || []
        existingRanges.push([clipStart, safeEnd])
        usedRanges.set(candidate.videoPath, existingRanges)

        videoFiles.push(candidate.videoPath)
        timeRanges.push([clipStart.toFixed(3), safeEnd.toFixed(3)])
        remaining -= sliceDuration

        console.log(
          `[assemble-force-fill] [${index}] stage=${sentence.stage} ${path.basename(candidate.videoPath)} remain=${remaining.toFixed(3)} → trim=${clipStart.toFixed(3)}-${safeEnd.toFixed(3)}`,
        )
      }
    }
  })

  const targetDuration =
    totalAudioDuration ||
    stageSentences.reduce((sum, sentence) => sum + (sentence.end - sentence.start), 0)
  let currentDuration = getCurrentAssembledDuration(timeRanges)
  let tailRanked = buildTailFillRanked(candidates)

  while (targetDuration - currentDuration > 0.12 && tailRanked.length > 0) {
    let chosenIndex = null

    // 找一个有可用 window 的候选（不提前移除）
    for (const idx of tailRanked) {
      const candidate = candidates[idx]
      const videoDur = candidate.videoDur || 15
      const clipStart = candidate.timestamp
      const clipEnd = Math.min(videoDur, clipStart + (candidate.availableDuration || 0))
      const existingRanges = usedRanges.get(candidate.videoPath) || []
      const window = findAvailableWindow(
        existingRanges,
        clipStart,
        clipEnd,
        targetDuration - currentDuration,
      )
      if (window) {
        chosenIndex = idx
        const [trimStart, safeEnd] = window
        const clipDuration = safeEnd - trimStart

        existingRanges.push([trimStart, safeEnd])
        usedRanges.set(candidate.videoPath, existingRanges)

        console.log(
          `[assemble-tail-fill] ${path.basename(candidate.videoPath)} raw_ts=${candidate.timestamp} videoDur=${videoDur} remain=${(targetDuration - currentDuration).toFixed(3)} → trim=${trimStart}-${safeEnd.toFixed(3)}`,
        )

        videoFiles.push(candidate.videoPath)
        timeRanges.push([trimStart.toFixed(3), safeEnd.toFixed(3)])
        currentDuration += clipDuration
        break
      }
    }

    if (chosenIndex !== null) {
      // 移除用过的候选
      tailRanked = tailRanked.filter((idx) => idx !== chosenIndex)
    } else {
      // 找不到任何不重叠片段了，强制无视重叠填满
      if (candidates.length === 0) break

      const candidate = candidates[Math.floor(random() * candidates.length)]
      const clipStart = candidate.timestamp
      const available = candidate.availableDuration || (candidate.videoDur || 15) - clipStart
      const sliceDuration = Math.min(available, targetDuration - currentDuration)
      if (sliceDuration <= 0.05) break

      const safeEnd = clipStart + sliceDuration
      videoFiles.push(candidate.videoPath)
      timeRanges.push([clipStart.toFixed(3), safeEnd.toFixed(3)])
      currentDuration += sliceDuration

      console.log(
        `[assemble-tail-force-fill] ${path.basename(candidate.videoPath)} remain=${(targetDuration - currentDuration).toFixed(3)} → trim=${clipStart.toFixed(3)}-${safeEnd.toFixed(3)}`,
      )
    }
  }

  return { videoFiles, timeRanges }
}
