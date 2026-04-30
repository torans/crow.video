import fs from 'node:fs'
import axios from 'axios'
import { spawn } from 'child_process'
import { sqQuery } from '../sqlite/index.ts'
import {
  applyVisualStagePlan,
  assembleSegments,
  buildLlmCandidateKeywordPool,
  classifySentenceStages,
  inferCandidateStageHints,
  scoreCandidateForLlmPool,
  type CandidateClip,
  type ProductInfo,
  type RankedSentenceSelection,
  type Sentence,
  type StageSentence,
  type SegmentStage,
} from './llm-match-core.ts'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const ffmpegPkg: string = require('ffmpeg-static')
export const ffmpegBin: string = VITE_DEV_SERVER_URL
  ? ffmpegPkg
  : (ffmpegPkg as string).replace('app.asar', 'app.asar.unpacked')

// ========================
// 1. 解析 ASS 字幕文件
// ========================
export function parseAssSentences(assFilePath: string): Sentence[] {
  const content = fs.readFileSync(assFilePath, 'utf-8')
  const sentences: Sentence[] = []

  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('Dialogue:')) continue

    const parts = trimmed.slice(9).split(',')
    if (parts.length < 10) continue

    const startStr = parts[1].trim()
    const endStr = parts[2].trim()
    const text = parts[9]
      .replace(/\\N/g, ' ')
      .replace(/\{[^}]*\}/g, '')
      .trim()

    if (!text) continue

    const start = parseAssTime(startStr)
    const end = parseAssTime(endStr)
    if (end <= start) continue

    sentences.push({ text, start, end })
  }

  return sentences
}

function parseAssTime(ts: string): number {
  const match = ts.match(/(\d+):(\d+):(\d+)\.(\d+)/)
  if (!match) return 0
  const [, h, m, s, cs] = match.map(Number)
  return h * 3600 + m * 60 + s + cs / 100
}

// ========================
// 2. 增强型粗筛
// ========================
export async function fetchTopKCandidates(
  sentences: Sentence[],
  videoAssets: string[],
  productInfo?: ProductInfo,
  k: number = 80,
): Promise<CandidateClip[]> {
  if (videoAssets.length === 0) return []

  const records = (await sqQuery({
    sql: `SELECT video_path, timestamp, description, tags, colors
          FROM video_frame_analysis
          WHERE video_path IN (${videoAssets.map(() => '?').join(',')})`,
    params: videoAssets,
  })) as any[]

  if (records.length === 0) return []

  // 粗筛阶段直接基于传入的 sentences 进行关键词提取
  // 如果是跨语言环境，外部已经完成了对 sentences 的翻译对齐
  const searchKeywords = buildLlmCandidateKeywordPool(sentences, productInfo)

  const scored = records.map((record) => {
    let tags: string[] = []
    let colors: string[] = []
    try {
      tags = JSON.parse(record.tags || '[]')
      colors = JSON.parse(record.colors || '[]')
    } catch {}
    const relevance = scoreCandidateForLlmPool(
      {
        description: record.description || '',
        tags,
        colors,
      },
      searchKeywords,
      productInfo,
    )

    return {
      videoPath: record.video_path,
      timestamp: Number.parseFloat(String(record.timestamp)) || 0,
      description: record.description || '',
      tags,
      colors,
      relevance,
    }
  })

  const sorted = scored.sort((a, b) => b.relevance - a.relevance)
  const overallQuota = Math.max(20, Math.floor(k * 0.7))
  const productQuota = Math.max(12, Math.floor(k * 0.3))

  const merged = sorted.slice(0, overallQuota)
  const seen = new Set(merged.map((candidate) => `${candidate.videoPath}@${candidate.timestamp}`))

  for (const candidate of sorted) {
    if (merged.length >= k || productQuota <= 0) break
    const hints = inferCandidateStageHints(candidate)
    const isProductish =
      hints.includes('product') || hints.includes('detail') || hints.includes('result')
    if (!isProductish) continue

    const key = `${candidate.videoPath}@${candidate.timestamp}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(candidate)
  }

  return merged.slice(0, k)
}

function buildStageAwareCandidateList(
  candidates: CandidateClip[],
  videoDurations: Map<string, number>,
): CandidateClip[] {
  return candidates.map((candidate) => {
    const videoDur = videoDurations.get(candidate.videoPath) || 15
    const safeTrimStart = candidate.timestamp >= videoDur ? 0 : candidate.timestamp
    return {
      ...candidate,
      timestamp: safeTrimStart,
      videoDur,
      availableDuration: Math.max(0, videoDur - safeTrimStart),
    }
  })
}

function buildCandidatePrompt(candidates: CandidateClip[]): string {
  return candidates
    .map((candidate, index) => {
      const available = (candidate.availableDuration || 0).toFixed(2)
      return `[ID: ${index}] stageHints=[${inferCandidateStageHints(candidate).join(', ')}] available=${available}s ts=${candidate.timestamp.toFixed(2)}s 颜色=[${candidate.colors.join(', ')}] 描述="${candidate.description}" 标签=[${candidate.tags.join(', ')}]`
    })
    .join('\n')
}

function buildSentencePrompt(sentences: StageSentence[]): string {
  return sentences
    .map((sentence) => {
      const duration = (sentence.end - sentence.start).toFixed(2)
      return `第${sentence.index + 1}句 stage=${sentence.stage} duration=${duration}s: "${sentence.text}"`
    })
    .join('\n')
}

function isStage(value: unknown): value is RankedSentenceSelection['stage'] {
  return value === 'hook' || value === 'content' || value === 'product' || value === 'detail' || value === 'scene' || value === 'result' || value === 'cta'
}

function dedupeIndices(indices: number[]): number[] {
  return [...new Set(indices)]
}

// ========================
// 3. 导演级 LLM 排序
// ========================
export async function callLLMMatch(
  sentences: StageSentence[],
  candidates: CandidateClip[],
  llmConfig: any,
  productInfo?: ProductInfo,
): Promise<RankedSentenceSelection[]> {
  const candidateList = buildCandidatePrompt(candidates)
  const sentenceList = buildSentencePrompt(sentences)

  const systemPrompt = `你是一位短视频剪辑导演，正在为 20-30 秒带货视频编排镜头。你的任务不是只做“语义相似匹配”，而是要在句子语义正确的前提下，尽量满足短视频镜头结构。

镜头结构目标：
1. 开头 1-2 个镜头必须优先选择 hook/吸睛素材，禁止把纯静态参数或纯细节素材放在最前面。
2. 中段优先让场景(scene) 与 产品展示(product/detail)交替推进，避免连续多个纯场景或连续多个纯产品空镜。
3. 产品展示相关镜头（product、detail、result）应明显占比较高，至少接近全片 1/3。
4. 全片至少需要有一个 detail 候选排在前面，用来支撑产品细节展示。
5. 结尾优先 result / cta / product，用于结果强化和下单转化。

候选素材中的 stageHints 含义：
- hook: 强视觉冲击、强动作、结果预览
- product: 产品整体展示、主体明确
- detail: 产品近景、材质、接口、纹理、做工
- scene: 真实使用场景、实战、演示
- result: 前后对比、效果反馈、结果展示
- cta: 收尾、展示全貌、适合转化
- content: 泛化中段卖点素材

排序规则：
- **一致性原则 (最高优先级)**：检查素材描述中的产品特征（如颜色、材质、类型）是否与当前产品信息一致。
  - **重要：防止环境干扰**。如果产品是蓝色的，素材描述里说“蓝色天空下的黑色鱼线”，即便有“蓝色”二字也属于严重不匹配，必须排除。
  - 严禁出现“货不对板”：如果产品是鱼线，素材必须是鱼线；如果产品是蓝色，素材的主体必须是蓝色。
- 先保证当前句子的语义和 stage 合适，再考虑丰富度和交替节奏。
- 对 content 句，优先 product/detail，其次 content，再次 result。
- 对 scene 句，优先 scene；product/detail 只能作为次选。
- 对 cta 句，优先 result/cta/product。
- 优先选择 availableDuration 足够覆盖该句时长的候选。
- 可以推荐多个备选，供剪辑系统做去重和补时长。

返回纯 JSON 数组，每项必须包含：
{"stage":"hook|content|product|detail|scene|result|cta","primarySegmentIndex":number,"backupSegmentIndices":[number,...],"reason":"简短原因"}`

  const userPrompt = `产品信息：${JSON.stringify(productInfo || {})}
字幕句子：
${sentenceList}

候选素材：
${candidateList}

请为每句返回最合适的候选排序。`

  try {
    const response = await axios.post(
      `${llmConfig.apiUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        model: llmConfig.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
      },
      {
        headers: { Authorization: `Bearer ${llmConfig.apiKey}` },
        timeout: 60000,
      },
    )

    const content = response.data?.choices?.[0]?.message?.content || ''
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('LLM 响应格式错误')

    const result = JSON.parse(jsonMatch[0])
    return sentences.map((sentence, index) => {
      const row = result[index] || {}
      const indices = [
        Number(row.primarySegmentIndex),
        ...(Array.isArray(row.backupSegmentIndices) ? row.backupSegmentIndices : []).map(Number),
      ].filter(
        (value: number) => Number.isInteger(value) && value >= 0 && value < candidates.length,
      )

      return {
        stage: isStage(row.stage) ? row.stage : sentence.stage,
        rankedSegmentIndices: dedupeIndices(indices),
        reason: typeof row.reason === 'string' ? row.reason : '',
      }
    })
  } catch (error) {
    console.error('[llm-match] 匹配失败，回退到启发式排序:', error)
    return sentences.map((sentence) => ({
      stage: sentence.stage,
      rankedSegmentIndices: [],
      reason: 'fallback',
    }))
  }
}

// ========================
// 辅助与入口
// ========================
async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, ['-i', videoPath])
    let stderr = ''
    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    proc.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      if (match) {
        const [, h, m, s, cs] = match.map(Number)
        resolve(h * 3600 + m * 60 + s + cs / 100)
      } else {
        resolve(10)
      }
    })
  })
}

export async function matchVideoSegmentsByLLM(params: {
  subtitleFile: string
  originalScript?: string // 新增：原始带标签的脚本
  videoAssets: string[]
  productInfo?: ProductInfo
  targetDuration?: number
  llmConfig: { apiUrl: string; apiKey: string; modelName: string }
}) {
  const { subtitleFile, originalScript, videoAssets, productInfo, targetDuration, llmConfig } = params

  // 1. 解析字幕
  const assSentences = parseAssSentences(subtitleFile)
  
  // 2. 结合原始脚本提取标签
  let sentences: StageSentence[] = []
  if (originalScript) {
    const scriptLines = originalScript.split('\n').filter(line => line.trim())
    sentences = assSentences.map((sentence, index) => {
      const scriptLine = scriptLines[index] || ''
      const tagMatch = scriptLine.match(/\[([^\]]+)\]/)
      const tag = tagMatch ? tagMatch[1] : ''
      
      let stage: SegmentStage = 'content'
      const lowTag = tag.toLowerCase()
      if (tag.includes('吸睛') || lowTag.includes('hook')) stage = 'hook'
      else if (tag.includes('场景') || lowTag.includes('scene')) stage = 'scene'
      else if (tag.includes('产品') || lowTag.includes('product')) stage = 'product'
      else if (tag.includes('细节') || lowTag.includes('detail')) stage = 'detail'
      else if (tag.includes('效果') || lowTag.includes('result')) stage = 'result'
      else if (tag.includes('转化') || lowTag.includes('cta')) stage = 'cta'
      
      return { ...sentence, index, stage }
    })
  } else {
    // 回退到启发式分类
    sentences = applyVisualStagePlan(classifySentenceStages(assSentences))
  }

  // --- 跨语言匹配补丁：语义对齐 ---
  let matchingSentences = sentences
  const isMultilingual = sentences.every(s => !/[\u4e00-\u9fa5]/.test(s.text))
  
  if (isMultilingual && sentences.length > 0) {
    try {
      console.log('[llm-match] 正在进行语义对齐翻译...')
      const translatePrompt = `你是一个翻译专家。请将以下短视频脚本逐句翻译成中文，保持原意。
返回纯 JSON 数组格式: ["翻译1", "翻译2", ...]
脚本内容:
${sentences.map(s => s.text).join('\n')}`

      const transRes = await axios.post(
        `${llmConfig.apiUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          model: llmConfig.modelName,
          messages: [{ role: 'user', content: translatePrompt }],
          temperature: 0.3,
        },
        { headers: { Authorization: `Bearer ${llmConfig.apiKey}` }, timeout: 15000 }
      )
      
      const transContent = transRes.data?.choices?.[0]?.message?.content || ''
      const transJsonMatch = transContent.match(/\[.*\]/s)
      if (transJsonMatch) {
        const translatedTexts = JSON.parse(transJsonMatch[0])
        matchingSentences = sentences.map((s, i) => ({
          ...s,
          text: translatedTexts[i] || s.text
        }))
        console.log('[llm-match] 语义对齐完成:', matchingSentences.map(s => s.text))
      }
    } catch (e) {
      console.error('[llm-match] 语义对齐翻译失败:', e)
    }
  }

  const baseCandidates = await fetchTopKCandidates(matchingSentences, videoAssets, productInfo, 80)

  const uniqueVideos = [...new Set(baseCandidates.map((candidate) => candidate.videoPath))]
  const videoDurations = new Map<string, number>()
  await Promise.all(
    uniqueVideos.map(async (videoPath) => {
      videoDurations.set(videoPath, await getVideoDuration(videoPath))
    }),
  )

  const candidates = buildStageAwareCandidateList(baseCandidates, videoDurations)
  const llmResult = await callLLMMatch(matchingSentences, candidates, llmConfig, productInfo)
  const assembled = assembleSegments(matchingSentences, llmResult, candidates, productInfo, targetDuration)

  const totalDuration = assembled.timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )
  const originalTarget = targetDuration || sentences.reduce(
    (sum, sentence) => sum + (sentence.end - sentence.start),
    0,
  )

  console.log(
    `[llm-match] assembled segments=${assembled.videoFiles.length} total=${totalDuration.toFixed(3)} target=${originalTarget.toFixed(3)}`,
  )

  return assembled
}
