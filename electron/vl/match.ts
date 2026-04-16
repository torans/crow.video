import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { sqQuery } from '../sqlite'
import type {
  MatchVideoSegmentsParams,
  MatchVideoSegmentsResult,
  MatchedSegment,
  VideoFrameAnalysisRecord,
} from './types'

// ============================================================
// 调试日志：写入文件
// ============================================================

function getMatchLogPath(): string {
  return path.join(os.tmpdir(), `crow_match_${new Date().toISOString().slice(0, 13).replace('T', '_')}.log`)
}

interface LogEntry {
  ts: string
  phase: string
  [key: string]: unknown
}

function matchLog(phase: string, data: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    phase,
    ...data,
  }
  const line = JSON.stringify(entry) + '\n'
  const logPath = getMatchLogPath()
  try {
    fs.appendFileSync(logPath, line, 'utf-8')
    console.log(`[matchLog] 写入成功: ${logPath}, phase=${phase}`)
  } catch (err) {
    console.error(`[matchLog] 写入失败: ${logPath}, phase=${phase}, error=`, err)
  }
}

// ============================================================
// 评分函数
// ============================================================

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
 * 【硬淘汰机制】
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

    // 【硬淘汰】覆盖率低于 34% 直接毙掉
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

/**
 * 场景模式打分：跳过颜色硬淘汰，用场景标签匹配
 * 语义权重更高（0.7 vs 0.4）
 */
function computeSceneScore(
  productSceneTags: string[],
  frameColors: string[],
  frameTags: string[],
): number {
  const tScore = tagMatchScore(productSceneTags, frameTags)
  // 场景模式：无颜色硬淘汰，颜色惩罚也轻
  const cScore = colorMatchScore([], frameColors)
  const base = cScore * 0.2 + tScore * 0.8

  // 标签惩罚
  const tagPenalty = tScore > 0 ? 1.0 : 0.05

  return base * tagPenalty
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
  frameColors: string[]
  frameTags: string[]
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
  console.log('[matchVideoSegments] 函数被调用！')
  const {
    productColors,
    productTags,
    productSceneTags = [],
    targetDuration,
    videoPaths,
    text,
    minSegmentDuration = 2,
    maxSegmentDuration = 15,
    matchMode = 'auto',
  } = params

  // 场景模式判断逻辑：
  // 'scene' = 强制场景模式
  // 'product' = 强制产品模式（严格颜色+标签）
  // 'auto' = 自动检测，有场景标签则用场景模式
  const isSceneMode = matchMode === 'scene' || (matchMode === 'auto' && productSceneTags.length > 0)
  console.log(`[matchVideoSegments] 模式: ${isSceneMode ? '场景' : '产品'}模式 (matchMode=${matchMode}, sceneTags=${productSceneTags.length})`)

  console.log('[matchVideoSegments] 调用了！productColors=', productColors, 'productTags=', productTags)
  const logPath = getMatchLogPath()
  try {
    fs.writeFileSync(logPath, `[${new Date().toISOString()}] matchVideoSegments 调用\n`)
    fs.appendFileSync(logPath, `productColors=${JSON.stringify(productColors)}\n`)
    fs.appendFileSync(logPath, `productTags=${JSON.stringify(productTags)}\n`)
    fs.appendFileSync(logPath, `targetDuration=${targetDuration}\n`)
    fs.appendFileSync(logPath, `text=${text}\n`)
    fs.appendFileSync(logPath, `videoPaths count=${videoPaths?.length ?? 'all'}\n`)
    console.log(`[matchVideoSegments] 日志文件写入成功: ${logPath}`)
  } catch (err) {
    console.error(`[matchVideoSegments] 日志文件写入失败: ${logPath}, error=`, err)
  }
  matchLog('START', {
    productColors,
    productTags,
    productSceneTags,
    matchMode,
    isSceneMode,
    targetDuration,
    videoPaths,
    text,
    minSegmentDuration,
    maxSegmentDuration,
  })

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

  matchLog('FRAMES_LOADED', { totalFrames: frames.length, frames: frames.map(f => ({
    videoPath: f.video_path,
    timestamp: f.timestamp,
    description: f.description,
    colors: f.colors,
    tags: f.tags,
  }))})

  if (frames.length === 0) {
    matchLog('NO_FRAMES')
    return { videoFiles: [], timeRanges: [] }
  }

  // Score each frame (product-level or scene-level matching)
  const scoredFrames: ScoredFrame[] = []
  for (const frame of frames) {
    let frameColors: string[] = []
    let frameTags: string[] = []
    try {
      frameColors = JSON.parse(frame.colors)
    } catch {}
    try {
      frameTags = JSON.parse(frame.tags)
    } catch {}

    let score: number
    if (isSceneMode) {
      // 场景模式：用场景标签打分，跳过颜色硬淘汰
      score = computeSceneScore(productSceneTags, frameColors, frameTags)
    } else {
      // 产品模式：严格颜色+标签双重匹配
      score = computeScore(productColors, productTags, frameColors, frameTags)
    }
    scoredFrames.push({
      videoPath: frame.video_path,
      timestamp: frame.timestamp,
      score,
      appeal: frame.appeal ?? 5,
      description: frame.description || '',
      frameColors,
      frameTags,
    })
  }

  matchLog('FRAMES_SCORED', {
    allScores: scoredFrames.map(f => ({
      videoPath: path.basename(f.videoPath),
      timestamp: f.timestamp,
      score: f.score,
      appeal: f.appeal,
      description: f.description,
      frameColors: f.frameColors,
      frameTags: f.frameTags,
    }))
  })

  const filteredFrames = scoredFrames.filter((f) => f.score > 0)
  matchLog('FRAMES_FILTERED', {
    passedCount: filteredFrames.length,
    passed: filteredFrames.map(f => ({
      videoPath: path.basename(f.videoPath),
      timestamp: f.timestamp,
      score: f.score,
      description: f.description,
    }))
  })

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
    // 放宽限制：允许轻微超出 targetDuration（最多超出 20%）
    const remaining = slotRemaining !== undefined ? Math.min(slotRemaining, globalRemaining * 1.2) : globalRemaining * 1.2
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
    if (productColors.length === 0) return filteredFrames

    const pSet = new Set(productColors.map((c) => c.toLowerCase()))
    const colorMatched = filteredFrames.filter((f) => {
      const fSet = new Set(f.frameColors.map((c) => c.toLowerCase()))
      let matched = 0
      for (const color of pSet) {
        if (fSet.has(color)) matched++
      }
      return matched / pSet.size >= 0.5
    })

    return colorMatched.length > 0 ? colorMatched : filteredFrames
  }

  // === Semantic alignment mode (when text is provided) ===
  if (text && text.trim().length > 0) {
    const sentences = splitSentences(text, targetDuration)
    matchLog('SEMANTIC_MODE', { sentenceCount: sentences.length, sentences: sentences.map(s => ({
      text: s.text,
      start: s.start,
      end: s.end,
      duration: s.end - s.start,
    }))})

    // 按时间段长度降序排列，优先填大 slot，避免贪心算法导致大 slot 最后只能选差候选
    const sortedIndices = sentences
      .map((s, i) => ({ i, dur: s.end - s.start }))
      .sort((a, b) => b.dur - a.dur)

    // 记录每个 slot 选中的片段（用 slotIdx 保持原始时间顺序）
    const slotSegmentMap: Array<{ slotIdx: number; videoPath: string; timeRange: [string, string] }> = []

    for (const { i } of sortedIndices) {
      const slot = sentences[i]
      const slotDuration = slot.end - slot.start
      const keywords = extractKeywords(slot.text)

      const ranked = filteredFrames
        .map((f) => {
          const semantic = descriptionRelevance(keywords, f.description)
          // 场景模式：语义权重 0.8；产品模式：语义权重 0.4
          const semanticWeight = isSceneMode ? 0.8 : 0.4
          const combined = f.score * (1 - semanticWeight) + semantic * semanticWeight
          return { ...f, combined, semantic }
        })
        .sort((a, b) => b.combined - a.combined)

      matchLog('SLOT_RANKED', {
        slotIndex: i,
        slotText: slot.text,
        slotStart: slot.start,
        slotEnd: slot.end,
        slotDuration,
        keywords,
        candidates: ranked.slice(0, 10).map(f => ({
          videoPath: path.basename(f.videoPath),
          timestamp: f.timestamp,
          score: f.score,
          semantic: f.semantic,
          combined: f.combined,
          appeal: f.appeal,
          description: f.description,
        }))
      })

      let slotFilled = 0
      for (const candidate of ranked) {
        // 只要当前时长未超过 targetDuration 的 120%，就继续尝试填入
        if (slotFilled >= slotDuration || currentDuration >= targetDuration * 1.2) break
        const slotRemaining = slotDuration - slotFilled
        const beforeDur = currentDuration
        if (tryAddSegment(candidate, slotRemaining)) {
          const filled = currentDuration - beforeDur
          slotFilled += filled
          // 记录该 slot 对应的片段，后续按原始时间顺序重排
          slotSegmentMap.push({
            slotIdx: i,
            videoPath: candidate.videoPath,
            timeRange: [result.timeRanges[result.timeRanges.length - 1][0], result.timeRanges[result.timeRanges.length - 1][1]],
          })
          matchLog('SEGMENT_SELECTED', {
            slotIndex: i,
            videoPath: candidate.videoPath,
            timestamp: candidate.timestamp,
            segStart: result.timeRanges[result.timeRanges.length - 1][0],
            segEnd: result.timeRanges[result.timeRanges.length - 1][1],
            filledDuration: filled,
            score: candidate.score,
            semantic: candidate.semantic,
            appeal: candidate.appeal,
            description: candidate.description,
          })
        }
      }

      if (slotFilled < slotDuration) {
        matchLog('SLOT_UNDERFILLED', {
          slotIndex: i,
          slotText: slot.text,
          requestedDuration: slotDuration,
          filledDuration: slotFilled,
          remaining: targetDuration - currentDuration,
        })
      }
    }

    // 按原始句子时间顺序重排，确保与音频时间轴一致
    if (slotSegmentMap.length > 0) {
      result.videoFiles = []
      result.timeRanges = []
      // 按 slotIdx 升序 = 原始时间顺序
      slotSegmentMap.sort((a, b) => a.slotIdx - b.slotIdx)
      for (const seg of slotSegmentMap) {
        result.videoFiles.push(seg.videoPath)
        result.timeRanges.push(seg.timeRange)
      }
      matchLog('SEGMENTS_REORDERED', {
        orderedSlots: slotSegmentMap.map(s => ({
          slotIdx: s.slotIdx,
          videoPath: path.basename(s.videoPath),
          timeRange: s.timeRange,
        }))
      })
    }

    if (currentDuration < targetDuration * 1.2) {
      // Fallback 时用全文本算 semantic，只留 > 0 的帧，确保不相关帧不会混进来
      const fullKeywords = extractKeywords(text)
      const fallbackPool = filteredFrames
        .filter(f => {
          const sem = descriptionRelevance(fullKeywords, f.description)
          return sem > 0
        })
        .sort((a, b) => b.score - a.score)
      // 如果过滤后为空（没有任何帧语义相关），才用全部 filteredFrames 按 score 排序
      const finalPool = fallbackPool.length > 0 ? fallbackPool : buildFallbackPool()
      finalPool.sort((a, b) => b.score - a.score)
      matchLog('FALLBACK_FILL', {
        poolSize: finalPool.length,
        remainingDuration: targetDuration - currentDuration,
        pool: finalPool.slice(0, 5).map(f => ({
          videoPath: path.basename(f.videoPath),
          timestamp: f.timestamp,
          score: f.score,
        }))
      })
      for (const candidate of finalPool) {
        if (currentDuration >= targetDuration) break
        const beforeDur = currentDuration
        if (tryAddSegment(candidate)) {
          matchLog('FALLBACK_SELECTED', {
            videoPath: candidate.videoPath,
            segStart: result.timeRanges[result.timeRanges.length - 1][0],
            segEnd: result.timeRanges[result.timeRanges.length - 1][1],
            filledDuration: currentDuration - beforeDur,
            score: candidate.score,
          })
        }
      }
    }

    matchLog('RESULT', {
      videoFiles: result.videoFiles.map(f => path.basename(f)),
      timeRanges: result.timeRanges,
      totalDuration: currentDuration,
      targetDuration,
    })
    return result
  }

  // === Legacy mode (no text, backward compatible) ===
  filteredFrames.sort((a, b) => b.score - a.score)

  const top30Count = Math.max(1, Math.ceil(filteredFrames.length * 0.3))
  const top30Frames = filteredFrames.slice(0, top30Count)
  top30Frames.sort((a, b) => {
    const aFinal = a.score * 0.5 + (a.appeal / 10) * 0.5
    const bFinal = b.score * 0.5 + (b.appeal / 10) * 0.5
    return bFinal - aFinal
  })

  matchLog('LEGACY_MODE', {
    top30Count,
    candidates: top30Frames.map(f => ({
      videoPath: path.basename(f.videoPath),
      timestamp: f.timestamp,
      score: f.score,
      appeal: f.appeal,
    }))
  })

  // Phase 1: Golden 3s
  for (const candidate of top30Frames) {
    if (currentDuration >= targetDuration) break
    if (tryAddSegment(candidate)) {
      matchLog('PHASE1_GOLDEN_SELECTED', {
        videoPath: candidate.videoPath,
        segStart: result.timeRanges[result.timeRanges.length - 1][0],
        segEnd: result.timeRanges[result.timeRanges.length - 1][1],
        score: candidate.score,
        appeal: candidate.appeal,
      })
      break
    }
  }

  // Phase 2: Fill remaining
  const fallbackPool = buildFallbackPool()
  fallbackPool.sort((a, b) => b.score - a.score)
  for (const candidate of fallbackPool) {
    if (currentDuration >= targetDuration) break
    const beforeDur = currentDuration
    if (tryAddSegment(candidate)) {
      matchLog('PHASE2_FALLBACK_SELECTED', {
        videoPath: candidate.videoPath,
        segStart: result.timeRanges[result.timeRanges.length - 1][0],
        segEnd: result.timeRanges[result.timeRanges.length - 1][1],
        filledDuration: currentDuration - beforeDur,
        score: candidate.score,
      })
    }
  }

  matchLog('RESULT', {
    videoFiles: result.videoFiles.map(f => path.basename(f)),
    timeRanges: result.timeRanges,
    totalDuration: currentDuration,
    targetDuration,
  })
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
