import fs from 'node:fs'
import axios from 'axios'
import { spawn } from 'child_process'
import { sqQuery } from '../sqlite/index.ts'
import {
  assembleSegments,
  classifySentenceStages,
  extractKeywords,
  inferCandidateStageHints,
  type CandidateClip,
  type ProductInfo,
  type RankedSentenceSelection,
  type Sentence,
  type StageSentence,
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

  const allKeywords = new Set<string>()
  for (const sentence of sentences) {
    extractKeywords(sentence.text).forEach((keyword) => allKeywords.add(keyword))
  }
  ;['抛投', '瞬间', '特写', '细节', '场景', '户外', '展示', '上鱼'].forEach((keyword) =>
    allKeywords.add(keyword),
  )

  const scored = records.map((record) => {
    let tags: string[] = []
    try {
      tags = JSON.parse(record.tags || '[]')
    } catch {}
    const searchable = `${record.description || ''} ${tags.join(' ')}`.toLowerCase()
    let relevance = 0

    allKeywords.forEach((keyword) => {
      if (searchable.includes(keyword.toLowerCase())) relevance += 3
    })

    return {
      videoPath: record.video_path,
      timestamp: Number.parseFloat(String(record.timestamp)) || 0,
      description: record.description || '',
      tags,
      relevance,
    }
  })

  return scored.sort((a, b) => b.relevance - a.relevance).slice(0, k)
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
      const dur = (candidate.videoDur || 0).toFixed(2)
      return `[ID: ${index}] stageHints=[${inferCandidateStageHints(candidate).join(', ')}] available=${available}s total=${dur}s ts=${candidate.timestamp.toFixed(2)}s 描述="${candidate.description}" 标签=[${candidate.tags.join(', ')}]`
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
  return value === 'hook' || value === 'content' || value === 'scene' || value === 'cta'
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

  const systemPrompt = `你是一位短视频剪辑导演。必须遵守这个结构：
1. hook：前3秒必须有动态冲击和强抓眼镜头。
2. content：展示产品参数、细节、质感或性能价值。
3. scene：展示真实使用场景/情境代入，而不是问题对比。
4. cta：展示成果、产品全貌或收尾转化镜头。

硬约束：
- 先保证 stage 匹配，再考虑丰富度。
- 优先选择 availableDuration 足够覆盖该句时长的候选。
- 可以推荐多个备选，供剪辑系统做去重和补时长。
- 返回纯 JSON 数组，每项必须包含：
  {"stage":"hook|content|scene|cta","primarySegmentIndex":number,"backupSegmentIndices":[number,...],"reason":"简短原因"}`

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
  videoAssets: string[]
  productInfo?: ProductInfo
  llmConfig: { apiUrl: string; apiKey: string; modelName: string }
}) {
  const { subtitleFile, videoAssets, productInfo, llmConfig } = params

  const sentences = classifySentenceStages(parseAssSentences(subtitleFile))
  const baseCandidates = await fetchTopKCandidates(sentences, videoAssets, 80)

  const uniqueVideos = [...new Set(baseCandidates.map((candidate) => candidate.videoPath))]
  const videoDurations = new Map<string, number>()
  await Promise.all(
    uniqueVideos.map(async (videoPath) => {
      videoDurations.set(videoPath, await getVideoDuration(videoPath))
    }),
  )

  const candidates = buildStageAwareCandidateList(baseCandidates, videoDurations)
  const llmResult = await callLLMMatch(sentences, candidates, llmConfig, productInfo)
  const assembled = assembleSegments(sentences, llmResult, candidates, productInfo)

  const totalDuration = assembled.timeRanges.reduce(
    (sum, [start, end]) => sum + (Number.parseFloat(end) - Number.parseFloat(start)),
    0,
  )
  const targetDuration = sentences.reduce(
    (sum, sentence) => sum + (sentence.end - sentence.start),
    0,
  )

  console.log(
    `[llm-match] assembled segments=${assembled.videoFiles.length} total=${totalDuration.toFixed(3)} target=${targetDuration.toFixed(3)}`,
  )

  return assembled
}
