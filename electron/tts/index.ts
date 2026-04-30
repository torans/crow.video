import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'child_process'
import { EdgeTTS } from '../lib/edge-tts'
import { ElevenLabsTTS, supportsTimestamps } from '../lib/elevenlabs-tts'
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

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const ffmpegPath: string = VITE_DEV_SERVER_URL
  ? require('ffmpeg-static')
  : (require('ffmpeg-static') as string).replace('app.asar', 'app.asar.unpacked')

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

async function probeMediaDuration(inputPath: string, timeoutMs: number = 10000): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-i', inputPath], {
      cwd: process.cwd(),
      env: process.env,
    })
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      reject(new Error(`获取媒体时长超时: ${inputPath}`))
    }, timeoutMs)

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
      if (!match) {
        reject(new Error(`无法解析媒体时长: ${inputPath}`))
        return
      }
      const [, h, m, s, cs] = match.map(Number)
      resolve(h * 3600 + m * 60 + s + cs / 100)
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(new Error(`Failed to probe media duration: ${error.message}`))
    })
  })
}

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
    const assString = result.getCaptionAssString(56, 300, 1920, 1080)
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
  const { text, voiceId, options, withCaption } = params
  if (withCaption && !supportsTimestamps(options?.modelId)) {
    throw new Error(
      `当前 ElevenLabs 模型 ${options?.modelId} 不支持时间戳字幕。请改用 eleven_multilingual_v2 或 eleven_flash_v2_5。`,
    )
  }
  const result = withCaption
    ? await elevenLabsTts.synthesizeWithTimestamps(text, voiceId, options)
    : await elevenLabsTts.synthesize(text, voiceId, options)

  let outputPath = params.outputPath ?? getTempTtsVoiceFilePath()
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await result.toFile(outputPath)

  let subtitlePath: string | undefined
  if (withCaption && typeof result.getCaptionAssString === 'function') {
    const assString = result.getCaptionAssString(56, 300, 1920, 1080)
    if (assString) {
      subtitlePath = path.join(path.dirname(outputPath), path.basename(outputPath, '.mp3') + '.ass')
      if (fs.existsSync(subtitlePath)) {
        fs.unlinkSync(subtitlePath)
      }
      fs.writeFileSync(subtitlePath, assString)
    }
  }

  // ElevenLabs 的 MP3 可能是 VBR，直接解析内存 buffer 容易高估时长。
  // 这里以实际落盘文件为准，避免后续分镜阶段追一个错误的大目标时长。
  let duration = 0
  try {
    duration = await probeMediaDuration(outputPath)
  } catch (error: any) {
    throw new Error(`音频元数据解析失败: ${error?.message ?? String(error)}`)
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('音频时长无效，请检查TTS配置或网络连接')
  }

  console.log(`[tts] ElevenLabs 合成完成: duration=${duration.toFixed(3)}s file=${outputPath}`)

  return {
    duration,
    subtitlePath,
    voicePath: outputPath,
  }
}
