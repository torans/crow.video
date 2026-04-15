import { sqQuery } from '../sqlite'
import type {
  MatchVideoSegmentsParams,
  MatchVideoSegmentsResult,
  MatchedSegment,
  VideoFrameAnalysisRecord,
} from './types'

/**
 * 计算帧颜色对产品颜色的覆盖率（核心匹配指标）
 * 衡量帧中有多少比例的产品主体颜色被呈现
 * 返回 0-1，越高越匹配
 */
function colorMatchScore(productColors: string[], frameColors: string[]): number {
  if (productColors.length === 0 || frameColors.length === 0) return 0

  const pSet = new Set(productColors.map((c) => c.toLowerCase()))
  const fSet = new Set(frameColors.map((c) => c.toLowerCase()))

  // 产品颜色覆盖率：帧呈现了多少比例的产品颜色
  let matchedProductColors = 0
  for (const color of pSet) {
    if (fSet.has(color)) matchedProductColors++
  }
  const productCoverage = matchedProductColors / pSet.size

  // 非产品颜色比例：帧中有多少颜色不是产品颜色
  // 用于降低"帧颜色混杂但碰巧有一个产品色"的误匹配分数
  const nonProductColors = fSet.size - matchedProductColors
  const nonProductRatio = Math.min(1.0, nonProductColors / Math.max(fSet.size, 1))
  // 非产品颜色越多，惩罚越重（0.5~1.0 之间）
  const framePenalty = 1 - nonProductRatio * 0.5

  return productCoverage * framePenalty
}

/**
 * Calculate tag similarity score between two tag sets.
 * Returns 0-1, where 1 means perfect match.
 */
function tagMatchScore(productTags: string[], frameTags: string[]): number {
  if (productTags.length === 0 || frameTags.length === 0) return 0

  const pSet = new Set(productTags)
  const fSet = new Set(frameTags)

  let matchCount = 0
  for (const tag of pSet) {
    if (fSet.has(tag)) matchCount++
  }

  const unionSize = new Set([...pSet, ...fSet]).size
  return unionSize > 0 ? matchCount / unionSize : 0
}

/**
 * 计算帧与产品的整体匹配分数
 *
 * 颜色权重 0.4，标签权重 0.6
 *
 * 【修复方案 A：硬淘汰机制】
 * - 如果颜色覆盖率太低（低于 0.34），说明严重串色，直接一票否决，返回 0
 */
function computeScore(
  productColors: string[],
  productTags: string[],
  frameColors: string[],
  frameTags: string[],
): number {
  const cScore = colorMatchScore(productColors, frameColors)
  const tScore = tagMatchScore(productTags, frameTags)
  const base = cScore * 0.4 + tScore * 0.6

  // 标签惩罚：不同类别直接压低分数
  const tagPenalty = tScore > 0 ? 1.0 : 0.1

  const pSet = new Set(productColors.map((c) => c.toLowerCase()))
  let productCoverage = 0
  
  if (productColors.length > 0) {
    const fSet = new Set(frameColors.map((c) => c.toLowerCase()))
    let matched = 0
    for (const color of pSet) {
      if (fSet.has(color)) matched++
    }
    productCoverage = matched / pSet.size

    // 【新增核心修复：硬淘汰】
    // 覆盖率低于 34% (意味着 3 个产品色连 1 个都没匹配上，或者全是冲突色)，直接毙掉
    // 阈值可以根据实际业务调整，如果要求更严，可以改为 0.5
    if (productCoverage < 0.34) {
      return 0
    }
  }

  // 颜色惩罚：根据覆盖率渐进压低分数
  const colorPenalty = productCoverage < 0.5
    ? 0.3 + productCoverage * 0.6
    : 1.0

  return base * tagPenalty * colorPenalty
}

// ============================================================
// Sentence splitting & keyword extraction for semantic alignment
// ============================================================

interface SentenceSlot {
  text: string
  start: number
  end: number
}

/**
 * Split text into sentences by Chinese/English punctuation,
 * then assign proportional time slots based on character count.
 */
function splitSentences(text: string, totalDuration: number): SentenceSlot[] {
  // Split by sentence-ending punctuation
  const raw = text
    .split(/[。！？；\n!?;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (raw.length === 0) return []

  const totalChars = raw.reduce((sum, s) => sum + s.length, 0)
  if (totalChars === 0) return []

  const slots: SentenceSlot[] = []
  let cursor = 0
  for (const sentence of raw) {
    const ratio = sentence.length / totalChars
    const duration = ratio * totalDuration
    slots.push({ text: sentence, start: cursor, end: cursor + duration })
    cursor += duration
  }
  return slots
}

/** Common Chinese stop words to filter out */
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '那', '被', '从',
  '把', '让', '给', '用', '而', '又', '与', '但', '对', '能', '可以',
  '这个', '那个', '什么', '怎么', '为什么', '吗', '呢', '吧', '啊', '哦',
  '呀', '嘛', '哈', '嗯', '噢', '哇', '超', '真', '太', '非常', '特别',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'to',
  'for', 'with', 'on', 'at', 'from', 'by', 'and', 'or', 'not', 'no',
  'it', 'its', 'this', 'that', 'i', 'you', 'he', 'she', 'we', 'they',
])

/**
 * Extract keywords from a sentence.
 * Chinese: character bigrams (2-char sliding window).
 * English/other: split by whitespace.
 * Filters out stop words and single-char tokens.
 */
function extractKeywords(sentence: string): string[] {
  const keywords: string[] = []
  const lower = sentence.toLowerCase()

  // Extract English words
  const englishWords = lower.match(/[a-z]{2,}/g) || []
  for (const w of englishWords) {
    if (!STOP_WORDS.has(w)) keywords.push(w)
  }

  // Extract Chinese bigrams
  const chineseChars = lower.replace(/[a-z0-9\s]/g, '').replace(/[，、：""''（）【】《》\-—…·\.,\d]/g, '')
  for (let i = 0; i < chineseChars.length - 1; i++) {
    const bigram = chineseChars.slice(i, i + 2)
    if (!STOP_WORDS.has(bigram)) {
      keywords.push(bigram)
    }
  }

  // Also add individual meaningful Chinese chars
  for (const char of chineseChars) {
    if (!STOP_WORDS.has(char) && char.length > 0) {
      keywords.push(char)
    }
  }

  return [...new Set(keywords)]
}

/**
 * Calculate how relevant a frame's description is to the given keywords.
 * Returns 0-1 based on keyword hit rate (simple includes matching).
 */
function descriptionRelevance(keywords: string[], frameDescription: string): number {
  if (keywords.length === 0 || !frameDescription) return 0

  const desc = frameDescription.toLowerCase()
  let hits = 0
  for (const kw of keywords) {
    if (desc.includes(kw)) hits++
  }
  return hits / keywords.length
}

// ============================================================
// Scored frame with description for semantic matching
// ============================================================

interface ScoredFrame extends MatchedSegment {
  description: string
}

// ============================================================
// Main matching algorithm
// ============================================================

/**
 * Smart match video segments based on product visual features.
 */
export async function matchVideoSegments(
  params: MatchVideoSegmentsParams,
): Promise<MatchVideoSegmentsResult> {
  const {
    productColors,
    productTags,
    targetDuration,
    videoPaths,
    text,
    minSegmentDuration = 2,
    maxSegmentDuration = 15,
  } = params

  let frames: VideoFrameAnalysisRecord[]
  if (videoPaths && videoPaths.length > 0) {
    const placeholders = videoPaths.map(() => '?').join(',')
    frames = (await sqQuery({
      sql: `SELECT * FROM video_frame_analysis WHERE video_path IN (${placeholders}) ORDER BY video_path, timestamp`,
      params: videoPaths,
    })) as VideoFrameAnalysisRecord[]
  } else {
    frames = (await sqQuery({
      sql: 'SELECT * FROM video_frame_analysis ORDER BY video_path, timestamp',
    })) as VideoFrameAnalysisRecord[]
  }

  if (frames.length === 0) {
    return { videoFiles: [], timeRanges: [] }
  }

  // Score each frame (product-level matching)
  const scoredFrames: ScoredFrame[] = frames.map((frame) => {
    let frameColors: string[] = []
    let frameTags: string[] = []
    try {
      frameColors = JSON.parse(frame.colors)
    } catch {}
    try {
      frameTags = JSON.parse(frame.tags)
    } catch {}

    return {
      videoPath: frame.video_path,
      timestamp: frame.timestamp,
      score: computeScore(productColors, productTags, frameColors, frameTags),
      appeal: frame.appeal ?? 5,
      description: frame.description || '',
    }
  }).filter((f) => f.score > 0) // 【新增核心修复】：得分为0的垃圾素材直接在这里被物理隔离，绝缘于后续的语义和吸引力提分阶段！

  // Shared state
  const result: MatchVideoSegmentsResult = {
    videoFiles: [],
    timeRanges: [],
  }
  let currentDuration = 0
  const usedRanges: Map<string, Array<[number, number]>> = new Map()
  const trunc3 = (n: number) => ((n * 1e3) << 0) / 1e3

  const tryAddSegment = (candidate: ScoredFrame, slotRemaining?: number): boolean => {
    const globalRemaining = targetDuration - currentDuration
    const remaining = slotRemaining !== undefined ? Math.min(slotRemaining, globalRemaining) : globalRemaining
    if (remaining <= 0) return false

    const segDuration = Math.min(
      maxSegmentDuration,
      Math.max(minSegmentDuration, remaining),
    )
    const halfDur = segDuration / 2

    const segStart = Math.max(0, candidate.timestamp - halfDur)
    const segEnd = segStart + segDuration

    const existingRanges = usedRanges.get(candidate.videoPath) || []
    const hasOverlap = existingRanges.some(
      ([s, e]) => segStart < e && segEnd > s,
    )
    if (hasOverlap) return false

    existingRanges.push([segStart, segEnd])
    usedRanges.set(candidate.videoPath, existingRanges)

    result.videoFiles.push(candidate.videoPath)
    result.timeRanges.push([String(trunc3(segStart)), String(trunc3(segEnd))])
    currentDuration = trunc3(currentDuration + segDuration)
    return true
  }

  // Fallback 池：要求至少 50% 产品颜色覆盖率
  const buildFallbackPool = (): ScoredFrame[] => {
    if (productColors.length === 0) return scoredFrames

    const pSet = new Set(productColors.map((c) => c.toLowerCase()))
    const colorMatched = scoredFrames.filter((f) => {
      const frame = frames.find(fr => fr.video_path === f.videoPath && fr.timestamp === f.timestamp)
      if (!frame) return false
      let frameColors: string[] = []
      try { frameColors = JSON.parse(frame.colors) } catch {}
      const fSet = new Set(frameColors.map((c) => c.toLowerCase()))
      let matched = 0
      for (const color of pSet) {
        if (fSet.has(color)) matched++
      }
      return matched / pSet.size >= 0.5
    })

    return colorMatched.length > 0 ? colorMatched : scoredFrames
  }

  // === Semantic alignment mode (when text is provided) ===
  if (text && text.trim().length > 0) {
    const sentences = splitSentences(text, targetDuration)
    console.log(`[智能选片] 语义对齐模式，${sentences.length} 个句子时间段`)

    for (let i = 0; i < sentences.length; i++) {
      const slot = sentences[i]
      const slotDuration = slot.end - slot.start
      const keywords = extractKeywords(slot.text)

      console.log(`[智能选片] 句${i + 1}: "${slot.text.slice(0, 30)}..." | ${trunc3(slot.start)}s~${trunc3(slot.end)}s | 关键词: ${keywords.slice(0, 6).join(',')}`)

      const ranked = scoredFrames
        .map((f) => {
          const semantic = descriptionRelevance(keywords, f.description)
          const combined = f.score * 0.6 + semantic * 0.4
          return { ...f, combined, semantic }
        })
        .sort((a, b) => {
          if (i === 0) {
            const aFinal = a.combined * 0.6 + (a.appeal / 10) * 0.4
            const bFinal = b.combined * 0.6 + (b.appeal / 10) * 0.4
            return bFinal - aFinal
          }
          return b.combined - a.combined
        })

      let slotFilled = 0
      for (const candidate of ranked) {
        if (slotFilled >= slotDuration || currentDuration >= targetDuration) break
        const slotRemaining = slotDuration - slotFilled
        const beforeDur = currentDuration
        if (tryAddSegment(candidate, slotRemaining)) {
          slotFilled += currentDuration - beforeDur
          if (candidate.semantic > 0) {
            console.log(`[智能选片]   语义命中: score=${trunc3(candidate.combined)} semantic=${trunc3(candidate.semantic)}`)
          }
        }
      }
    }

    if (currentDuration < targetDuration) {
      const fallbackPool = buildFallbackPool()
      fallbackPool.sort((a, b) => b.score - a.score)
      console.log(`[智能选片] 补充填充，使用${fallbackPool === scoredFrames ? '全部' : '同色'}素材池`)
      for (const candidate of fallbackPool) {
        if (currentDuration >= targetDuration) break
        tryAddSegment(candidate)
      }
    }

    return result
  }

  // === Legacy mode (no text, backward compatible) ===
  scoredFrames.sort((a, b) => b.score - a.score)

  const top30Count = Math.max(1, Math.ceil(scoredFrames.length * 0.3))
  const top30Frames = scoredFrames.slice(0, top30Count)
  top30Frames.sort((a, b) => {
    const aFinal = a.score * 0.5 + (a.appeal / 10) * 0.5
    const bFinal = b.score * 0.5 + (b.appeal / 10) * 0.5
    return bFinal - aFinal
  })

  // Phase 1: Golden 3s
  for (const candidate of top30Frames) {
    if (currentDuration >= targetDuration) break
    if (tryAddSegment(candidate)) break
  }

  // Phase 2: Fill remaining
  const fallbackPool = buildFallbackPool()
  fallbackPool.sort((a, b) => b.score - a.score)
  for (const candidate of fallbackPool) {
    if (currentDuration >= targetDuration) break
    tryAddSegment(candidate)
  }

  return result
}

/**
 * Get analysis statistics for video assets
 */
export async function getAnalysisStats(videoPaths: string[]): Promise<{
  analyzedCount: number
  totalCount: number
}> {
  if (videoPaths.length === 0) return { analyzedCount: 0, totalCount: 0 }

  const placeholders = videoPaths.map(() => '?').join(',')
  const result = await sqQuery({
    sql: `SELECT COUNT(DISTINCT video_path) as count FROM video_frame_analysis WHERE video_path IN (${placeholders})`,
    params: videoPaths,
  })

  return {
    analyzedCount: result[0]?.count ?? 0,
    totalCount: videoPaths.length,
  }
}