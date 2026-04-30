import { createHash } from 'node:crypto'
import path from 'node:path'

export interface Sentence {
  text: string
  start: number
  end: number
}

export type SegmentStage = 'hook' | 'content' | 'product' | 'detail' | 'scene' | 'result' | 'cta'

export interface CandidateClip {
  videoPath: string
  timestamp: number
  description: string
  tags: string[]
  colors: string[]
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
  hook: ['吸睛', '瞬间', '动态', '冲击', '爆发', '反差', '对比', '预览', '高光', '关键', '根本', '核心', '认知', 'hook', 'impact', 'dynamic', 'shock', 'highlight', 'wow'],
  content: ['参数', '数据', '顺滑', '体验', '性能', '材质', '工艺', '韧性', '耐磨', '做工', '精度', '重量', '密度', 'smooth', 'performance', 'material', 'quality', 'detail'],
  product: ['产品', '整体', '全貌', '主体', '轮廓', '外观', '鱼线', 'PE线', '鱼竿', '渔轮', '线杯', '路亚', 'product', 'item', 'gear', 'tackle', 'fishing line', 'rod', 'reel'],
  detail: ['细节', '特写', '接口', '纹理', '做工', '材质', '表面', '边缘', '厚度', '线径', '编织', '涂层', '结节', 'detail', 'closeup', 'texture', 'texture', 'structure'],
  scene: ['场景', '户外', '实战', '使用', '演示', '操作', '测试', '环境', '现场', '水面', '路面', '场地', '抛投', '中鱼', '拉力', 'outdoor', 'action', 'fishing', 'using', 'demo', 'test'],
  result: ['效果', '结果', '对比', '改善', '变化', '反馈', '稳定', '持久', 'result', 'effect', 'feedback', 'stable'],
  cta: ['转化', '尝试', '体验', '现在', '习惯', '记住', '值得', '试试', 'cta', 'order', 'buy', 'now', 'try', 'get'],
}

const CTA_HINTS = [
  '尝试',
  '体验',
  '试试',
  '记住',
  '习惯',
  '现在',
  '值得',
  '了解',
  '入手',
]
const SCENE_HINTS = [
  '场景',
  '户外',
  '实战',
  '使用',
  '演示',
  '操作',
  '测试',
  '环境',
  '水面',
  '路面',
  '现场',
  '场地',
]
const PRODUCT_HINTS = [
  '产品',
  '细节',
  '材质',
  '做工',
  '表面',
  '接口',
  '质感',
  '重量',
  '这款',
  '设计',
  '工艺',
  '结构',
]

function isSceneText(text: string): boolean {
  return SCENE_HINTS.some((keyword) => text.includes(keyword))
}

function isCtaText(text: string): boolean {
  return CTA_HINTS.some((keyword) => text.includes(keyword))
}

function isProductText(text: string): boolean {
  return PRODUCT_HINTS.some((keyword) => text.includes(keyword))
}

export function detectSentenceStage(text: string, index: number, total: number): SegmentStage {
  const normalized = text.trim()

  // 短视频（带货类）遵循「开头抓人 + 中段卖点/场景 + 结尾转化」。
  // 尽量通过语义做精准的基础归类，提供给后续 LLM 导演做参考

  if (index === 0) return 'hook'

  if (index === total - 1 && total <= 4) return 'cta'
  if (index >= total - 3 && isCtaText(normalized)) return 'cta'

  if (isProductText(normalized)) return 'product'
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

export function applyVisualStagePlan(sentences: StageSentence[]): StageSentence[] {
  // 根据用户强烈要求的强编排结构进行视频轨道排布：
  // 1高光 + 2场景实战 + 3产品展示 + 4场景实战 + 5细节展示 + 6场景实战 + 7尾部CTA
  const planned = sentences.map((sentence) => ({ ...sentence }))
  const len = planned.length
  
  if (len === 0) return planned
  
  // 1. 强制第一句为 hook，最后一句一定是 cta
  planned[0].stage = 'hook'
  if (len > 1) planned[len - 1].stage = 'cta'
  
  // 2. 依次填充中间的结构
  if (len > 2) planned[1].stage = 'scene'
  if (len > 3) planned[2].stage = 'product'
  if (len > 4) planned[3].stage = 'scene'
  if (len > 5) planned[4].stage = 'detail'
  if (len > 6) planned[5].stage = 'scene'
  
  // 3. 处理超出7句以上的中间部分（循环交替）
  for (let i = 6; i < len - 1; i++) {
    planned[i].stage = i % 2 === 0 ? 'product' : 'scene'
  }
  
  return planned
}

export function inferCandidateStageHints(candidate: CandidateClip): SegmentStage[] {
  const searchable = `${candidate.description} ${candidate.tags.join(' ')}`.toLowerCase()
  const hints = new Set<SegmentStage>()

  ;(Object.keys(STAGE_KEYWORDS) as SegmentStage[]).forEach((stage) => {
    if (STAGE_KEYWORDS[stage].some((keyword) => searchable.includes(keyword.toLowerCase()))) {
      hints.add(stage)
    }
  })

  if (hints.has('detail')) {
    hints.add('product')
    hints.delete('content')
  }
  if (hints.has('result')) hints.add('product')

  if (hints.size === 0) hints.add('content')

  if (hints.has('detail')) {
    return (['detail', 'product'] as SegmentStage[]).filter((stage) => hints.has(stage))
  }
  if (hints.has('result')) {
    return (['product', 'result', 'cta'] as SegmentStage[]).filter((stage) => hints.has(stage))
  }

  const orderedStages: SegmentStage[] = ['hook', 'product', 'content', 'scene', 'cta']
  return orderedStages.filter((stage) => hints.has(stage))
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
      // Content 是中段宽泛卖点，优先产品展示/细节，其次通用 content。
      if (candidateHints.includes('detail')) return 58
      if (candidateHints.includes('product')) return 56
      if (hasContent) return 55
      if (candidateHints.includes('result')) return 16
      if (hasHook || hasScene || hasCta) return -35
      return -10
    case 'product':
      if (candidateHints.includes('product')) return 65
      if (candidateHints.includes('detail')) return 52
      if (hasContent) return 24
      if (candidateHints.includes('result')) return 18
      if (hasHook || hasScene || hasCta) return -35
      return -10
    case 'detail':
      if (candidateHints.includes('detail')) return 72
      if (candidateHints.includes('product')) return 36
      if (hasContent) return 20
      return -35
    case 'scene':
      if (hasSameStage) return 45
      if (candidateHints.includes('product') || candidateHints.includes('detail')) return -8
      if (hasContent) return 0
      return -30
    case 'result':
      if (candidateHints.includes('result')) return 60
      if (candidateHints.includes('product')) return 28
      if (hasContent) return 6
      return -30
    case 'cta':
      if (hasSameStage) return 45
      if (candidateHints.includes('result')) return 30
      if (candidateHints.includes('product')) return 18
      if (hasContent) return 0
      return -30
  }
}

export function extractKeywords(text: string): string[] {
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) || []
  const english = text.match(/[a-zA-Z]{3,}/g) || []
  return [...chinese, ...english]
}

export function buildLlmCandidateKeywordPool(
  sentences: Sentence[],
  productInfo?: ProductInfo,
): Set<string> {
  const allKeywords = new Set<string>()
  for (const sentence of sentences) {
    extractKeywords(sentence.text).forEach((keyword) => allKeywords.add(keyword))
  }

  extractKeywords(
    [
      productInfo?.name || '',
      productInfo?.features || '',
      productInfo?.highlights || '',
      productInfo?.targetAudience || '',
    ].join(' '),
  ).forEach((keyword) => allKeywords.add(keyword))

  // 注入所有分镜关键词，确保跨语言环境下粗筛能捞到基础素材
  Object.values(STAGE_KEYWORDS).forEach(keywords => {
    keywords.forEach(keyword => allKeywords.add(keyword))
  })

  return allKeywords
}

export function scoreCandidateForLlmPool(
  candidate: Pick<CandidateClip, 'description' | 'tags' | 'colors'>,
  allKeywords: Set<string>,
  productInfo?: ProductInfo,
): number {
  const searchable = `${candidate.description || ''} ${candidate.tags.join(' ')} ${candidate.colors.join(' ')}`.toLowerCase()
  let relevance = 0

  // 1. 基础关键词匹配
  allKeywords.forEach((keyword) => {
    if (searchable.includes(keyword.toLowerCase())) relevance += 3
  })

  // 2. 产品名称与颜色强匹配 (核心逻辑)
  const COLOR_KEYWORDS = ['红', '蓝', '绿', '黑', '白', '黄', '橙', '紫', '金', '银', '青']
  
  if (productInfo?.name || productInfo?.features || productInfo?.highlights) {
    const fullProductText = `${productInfo.name || ''} ${productInfo.features || ''} ${productInfo.highlights || ''}`.toLowerCase()
    const productName = (productInfo.name || '').toLowerCase()
    
    // 2.1 名称匹配
    if (productName && searchable.includes(productName)) {
      relevance += 100 
    } else if (productName) {
      // 更加积极的拆分词：除了空格，还尝试提取 2 字以上的中文词
      const subWords = new Set<string>()
      productName.split(/[\s,，、._/-]+/).forEach(w => {
        if (w.length > 1) subWords.add(w)
      })
      // 提取中文词块 (匹配 2 个及以上连续中文)
      const cnMatches = productName.match(/[\u4e00-\u9fa5]{2,}/g) || []
      cnMatches.forEach(w => subWords.add(w))
      
      subWords.forEach(word => {
        if (searchable.includes(word)) relevance += 40
      })
    }

    // 2.2 颜色一致性匹配 (关键！)
    COLOR_KEYWORDS.forEach(color => {
      const hasColorInProduct = fullProductText.includes(color)
      const hasColorInVideo = searchable.includes(color)
      
      if (hasColorInProduct && hasColorInVideo) {
        relevance += 60 // 颜色对齐，大幅加分
      } else if (hasColorInProduct && !hasColorInVideo && COLOR_KEYWORDS.some(c => c !== color && searchable.includes(c))) {
        relevance -= 80 // 颜色冲突（产品是蓝的，素材是别的颜色的），大幅扣分
      }
    })
  }

  // 3. 阶段意图加成
  const hints = inferCandidateStageHints({
    videoPath: '',
    timestamp: 0,
    description: candidate.description,
    tags: candidate.tags,
    colors: candidate.colors,
    relevance: 0,
  })

  if (hints.includes('product')) relevance += 10
  if (hints.includes('detail')) relevance += 12
  if (hints.includes('result')) relevance += 8

  return relevance
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
  return candidates
    .map((candidate, index) => {
      const searchable = `${candidate.description} ${candidate.tags.join(' ')} ${candidate.colors.join(' ')}`.toLowerCase()
      let score = candidate.relevance

      // 1. 基础阶段评分
      const stageHints = inferCandidateStageHints(candidate)
      score += getStageMatchScore(sentence.stage, stageHints)
      
      // 2. 关键词匹配评分
      keywords.forEach((keyword) => {
        if (searchable.includes(keyword.toLowerCase())) score += 8
      })
      
      // 3. 产品名称与颜色一致性评分 (同步 fetch 阶段的强力算法)
      const COLOR_KEYWORDS = ['红', '蓝', '绿', '黑', '白', '黄', '橙', '紫', '金', '银', '青']
      if (productInfo?.name || productInfo?.features || productInfo?.highlights) {
        const fullProductText = `${productInfo.name || ''} ${productInfo.features || ''} ${productInfo.highlights || ''}`.toLowerCase()
        const productName = (productInfo.name || '').toLowerCase()
        
        // 3.1 名称匹配奖励
        if (productName && searchable.includes(productName)) {
          score += 100 
        } else if (productName) {
          const subWords = new Set<string>()
          productName.split(/[\s,，、._/-]+/).forEach(w => { if (w.length > 1) subWords.add(w) })
          const cnMatches = productName.match(/[\u4e00-\u9fa5]{2,}/g) || []
          cnMatches.forEach(w => subWords.add(w))
          subWords.forEach(word => {
            if (searchable.includes(word)) score += 40
          })
        }

        // 3.2 颜色一致性审计
        COLOR_KEYWORDS.forEach(color => {
          const hasColorInProduct = fullProductText.includes(color)
          const hasColorInVideo = searchable.includes(color)
          if (hasColorInProduct && hasColorInVideo) score += 60 
          else if (hasColorInProduct && !hasColorInVideo && COLOR_KEYWORDS.some(c => c !== color && searchable.includes(c))) {
            score -= 80 
          }
        })
      }

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
