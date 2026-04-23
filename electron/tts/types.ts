import { SynthesisOptions } from '../lib/edge-tts'
import type { SynthesisOptions as ElevenLabsSynthesisOptions } from '../lib/elevenlabs-tts'

export interface EdgeTtsSynthesizeCommonParams {
  text: string
  voice: string
  options?: SynthesisOptions
}

export interface EdgeTtsSynthesizeToFileParams extends EdgeTtsSynthesizeCommonParams {
  withCaption?: boolean
  outputPath?: string
}

export interface EdgeTtsSynthesizeToFileResult {
  /** 合成后的音频时长，单位秒 */
  duration: number | undefined
  /** 字幕文件路径（当 withCaption=true 时存在） */
  subtitlePath?: string
}

// ElevenLabs TTS types
export interface ElevenLabsTtsSynthesizeCommonParams {
  text: string
  voiceId: string
  options?: ElevenLabsSynthesisOptions
}

export interface ElevenLabsTtsSynthesizeToFileParams extends ElevenLabsTtsSynthesizeCommonParams {
  withCaption?: boolean
  outputPath?: string
}

export interface ElevenLabsTtsSynthesizeToFileResult {
  /** 合成后的音频时长，单位秒 */
  duration: number | undefined
  /** 字幕文件路径（当 withCaption=true 时存在） */
  subtitlePath?: string
  /** 实际生成的音频文件路径 */
  voicePath: string
}
