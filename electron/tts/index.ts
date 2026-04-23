import fs from 'node:fs'
import path from 'node:path'
import { EdgeTTS } from '../lib/edge-tts'
import { ElevenLabsTTS } from '../lib/elevenlabs-tts'
import { parseBuffer } from 'music-metadata'
import {
  EdgeTtsSynthesizeCommonParams,
  EdgeTtsSynthesizeToFileParams,
  EdgeTtsSynthesizeToFileResult,
  ElevenLabsTtsSynthesizeCommonParams,
  ElevenLabsTtsSynthesizeToFileParams,
  ElevenLabsTtsSynthesizeToFileResult,
} from './types'
import { getAppTempPath } from '../lib/tools'
import { app } from 'electron'

const edgeTts = new EdgeTTS()
const elevenLabsTts = new ElevenLabsTTS()
const setupTime = new Date().getTime()

export function getTempTtsVoiceFilePath() {
  return path.join(getAppTempPath(), `temp-tts-voice-${setupTime}.mp3`).replace(/\\/g, '/')
}

export function clearCurrentTtsFiles() {
  const voicePath = getTempTtsVoiceFilePath()
  if (fs.existsSync(voicePath)) {
    fs.unlinkSync(voicePath)
  }
  const assPath = path.join(path.dirname(voicePath), path.basename(voicePath, '.mp3') + '.ass')
  if (fs.existsSync(assPath)) {
    fs.unlinkSync(assPath)
  }
  // 兼容旧的 .srt 文件清理
  const srtPath = path.join(path.dirname(voicePath), path.basename(voicePath, '.mp3') + '.srt')
  if (fs.existsSync(srtPath)) {
    fs.unlinkSync(srtPath)
  }
}

app.on('before-quit', () => {
  clearCurrentTtsFiles()
})

export async function edgeTtsGetVoiceList() {
  return edgeTts.getVoices()
}

export async function edgeTtsSynthesizeToBase64(params: EdgeTtsSynthesizeCommonParams) {
  const { text, voice, options } = params
  const result = await edgeTts.synthesize(text, voice, options)
  return result.toBase64()
}

export async function edgeTtsSynthesizeToFile(
  params: EdgeTtsSynthesizeToFileParams,
): Promise<EdgeTtsSynthesizeToFileResult> {
  const { text, voice, options, withCaption } = params
  const result = await edgeTts.synthesize(text, voice, options)

  let outputPath = params.outputPath ?? getTempTtsVoiceFilePath()
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await result.toFile(outputPath)

  let subtitlePath: string | undefined
  if (withCaption) {
    // 使用 ASS 格式（支持字体大小和位置控制），距底部 300px，字体 56
    const assString = result.getCaptionAssString(80, 300, 1920, 1080)
    subtitlePath = path.join(path.dirname(outputPath), path.basename(outputPath, '.mp3') + '.ass')
    if (fs.existsSync(subtitlePath)) {
      fs.unlinkSync(subtitlePath)
    }
    fs.writeFileSync(subtitlePath, assString)
  }

  // 指定 mimeType 为 audio/mpeg (MP3)，避免自动检测格式失败
  let duration = 0
  try {
    const metadata = await parseBuffer(result.getBuffer(), { mimeType: 'audio/mpeg' })
    duration = metadata.format?.duration ?? 0
  } catch (error: any) {
    throw new Error(`音频元数据解析失败: ${error?.message ?? String(error)}`)
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('音频时长无效，请检查TTS配置或网络连接')
  }

  return {
    duration,
    subtitlePath,
  }
}

// ElevenLabs TTS functions
export function elevenLabsTtsSetApiKey(apiKey: string) {
  elevenLabsTts.setApiKey(apiKey)
}

export async function elevenLabsTtsGetVoiceList(params?: { pageSize?: number; language?: string; gender?: string; category?: string; age?: string; search?: string }) {
  return elevenLabsTts.getVoices(params)
}

export async function elevenLabsTtsSynthesizeToBase64(params: ElevenLabsTtsSynthesizeCommonParams) {
  const { text, voiceId, options } = params
  const result = await elevenLabsTts.synthesize(text, voiceId, options)
  return result.toBase64()
}

export async function elevenLabsTtsSynthesizeToFile(
  params: ElevenLabsTtsSynthesizeToFileParams,
): Promise<ElevenLabsTtsSynthesizeToFileResult> {
  const { text, voiceId, options } = params
  const result = await elevenLabsTts.synthesize(text, voiceId, options)

  let outputPath = params.outputPath ?? getTempTtsVoiceFilePath()
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await result.toFile(outputPath)

  // ElevenLabs doesn't provide word-level timestamps for captions
  // So we skip subtitle generation for now
  const subtitlePath: string | undefined = undefined

  // 指定 mimeType 为 audio/mpeg (MP3)，避免自动检测格式失败
  let duration = 0
  try {
    const metadata = await parseBuffer(result.getBuffer(), { mimeType: 'audio/mpeg' })
    duration = metadata.format?.duration ?? 0
  } catch (error: any) {
    throw new Error(`音频元数据解析失败: ${error?.message ?? String(error)}`)
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('音频时长无效，请检查TTS配置或网络连接')
  }

  return {
    duration,
    subtitlePath,
    voicePath: outputPath,
  }
}
