import fs from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import { parseBuffer } from 'music-metadata'
import {
  TtsSynthesizeParams,
  TtsSynthesizeToFileParams,
  TtsSynthesizeToFileResult,
  DashScopeResponse,
} from './types'
import { getAppTempPath } from '../lib/tools'
import { app } from 'electron'

const setupTime = new Date().getTime()

export function getTempTtsVoiceFilePath() {
  return path.join(getAppTempPath(), `temp-tts-voice-${setupTime}.wav`).replace(/\\/g, '/')
}

export function clearCurrentTtsFiles() {
  const voicePath = getTempTtsVoiceFilePath()
  if (fs.existsSync(voicePath)) {
    fs.unlinkSync(voicePath)
  }
  // 兼容旧的 .srt 文件清理
  const srtPath = path.join(path.dirname(voicePath), path.basename(voicePath, '.wav') + '.srt')
  if (fs.existsSync(srtPath)) {
    fs.unlinkSync(srtPath)
  }
}

app.on('before-quit', () => {
  clearCurrentTtsFiles()
})

/**
 * 调用 DashScope Qwen TTS API 进行语音合成
 * 返回音频文件的 URL
 */
async function callQwenTtsApi(params: TtsSynthesizeParams): Promise<DashScopeResponse> {
  const { text, config } = params
  const response = await axios.post<DashScopeResponse>(
    config.apiUrl,
    {
      model: config.model,
      input: {
        text,
        voice: config.voice,
        language_type: config.languageType,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    },
  )

  const data = response.data
  if (data.code && data.code !== '') {
    throw new Error(`TTS API 错误: ${data.code} - ${data.message}`)
  }
  if (!data.output?.audio?.url) {
    throw new Error('TTS API 未返回音频 URL')
  }

  return data
}

/**
 * 从 URL 下载音频文件到本地
 */
async function downloadAudio(url: string, outputPath: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  })
  const buffer = Buffer.from(response.data)
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  fs.writeFileSync(outputPath, buffer)
  return buffer
}

/**
 * 合成语音并返回音频 URL（用于试听）
 */
export async function ttsSynthesizeToUrl(params: TtsSynthesizeParams): Promise<string> {
  const data = await callQwenTtsApi(params)
  return data.output.audio.url
}

/**
 * 合成语音并保存到文件
 */
export async function ttsSynthesizeToFile(
  params: TtsSynthesizeToFileParams,
): Promise<TtsSynthesizeToFileResult> {
  const data = await callQwenTtsApi(params)

  const outputPath = params.outputPath ?? getTempTtsVoiceFilePath()
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }

  const buffer = await downloadAudio(data.output.audio.url, outputPath)

  // 解析音频元数据获取时长
  let duration = 0
  try {
    const metadata = await parseBuffer(buffer, { mimeType: 'audio/wav' })
    duration = metadata.format?.duration ?? 0
  } catch (error: any) {
    throw new Error(`音频元数据解析失败: ${error?.message ?? String(error)}`)
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('音频时长无效，请检查TTS配置或网络连接')
  }

  return { duration }
}
