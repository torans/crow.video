import axios, { AxiosError } from 'axios'
import { writeFileSync } from 'node:fs'

export interface SynthesisOptions {
  /** 模型 ID，如 eleven_v2, eleven_v3, eleven_multilingual_v2 */
  modelId?: string
  /** 语速，0.5 - 2.0，默认 1.0 */
  speed?: number
  /** 稳定性，0.0 - 1.0，默认 0.5 */
  stability?: number
  /** 相似度，0.0 - 1.0，默认 0.5 */
  similarity_boost?: number
  /** 风格，0.0 - 1.0，默认 0.0 */
  style?: number
  /** 是否使用 Scribe 模式 */
  use_scribe_richtext?: boolean
  /** 说话者描述，用于优化 */
  speaker_boost?: boolean
}

export interface Voice {
  voice_id: string
  name: string
  hash: string
  tone?: string[]
  description?: string
  labels?: Record<string, string>
  category?: string
  settings?: {
    stability?: number
    similarity_boost?: number
    style?: number
    use_speaker_boost?: boolean
  }
}

export interface VoicesResponse {
  voices: Voice[]
  has_more: boolean
  next_page_token?: string
  total_count?: number
}

export interface GetVoicesResult {
  voices: Voice[]
  hasMore: boolean
}

export interface SynthesisResult {
  toBase64(): string
  toFile(outputPath: string): Promise<void>
  getBuffer(): Buffer
  getFormat(): string
  getSize(): number
  getCaptionAssString?(
    fontSize?: number,
    marginFromBottom?: number,
    playResY?: number,
    playResX?: number,
  ): string
}

interface CharacterAlignment {
  characters: string[]
  character_start_times_seconds?: number[]
  character_end_times_seconds?: number[]
  character_start_times_ms?: number[]
  character_end_times_ms?: number[]
}

class SynthesisResultImpl implements SynthesisResult {
  private readonly audioBuffer: Buffer
  private readonly alignment?: CharacterAlignment

  constructor(audioData: Buffer, alignment?: CharacterAlignment) {
    this.audioBuffer = audioData
    this.alignment = alignment
  }

  toBase64(): string {
    if (this.audioBuffer.length === 0) {
      throw new Error('No audio data available.')
    }
    return this.audioBuffer.toString('base64')
  }

  async toFile(outputPath: string): Promise<void> {
    if (this.audioBuffer.length === 0) {
      throw new Error('No audio data available to save.')
    }
    writeFileSync(outputPath, this.audioBuffer)
  }

  getBuffer(): Buffer {
    return this.audioBuffer
  }

  getFormat(): string {
    return 'mp3'
  }

  getSize(): number {
    return this.audioBuffer.length
  }

  getCaptionAssString(
    fontSize: number = 56,
    marginFromBottom: number = 300,
    playResY: number = 1920,
    playResX: number = 1080,
  ): string {
    if (!this.alignment?.characters?.length) {
      return ''
    }

    const startsMs =
      this.alignment.character_start_times_ms ??
      this.alignment.character_start_times_seconds?.map((value) => value * 1000) ??
      []
    const endsMs =
      this.alignment.character_end_times_ms ??
      this.alignment.character_end_times_seconds?.map((value) => value * 1000) ??
      []

    if (!startsMs.length || !endsMs.length) {
      return ''
    }

    const posY = playResY - marginFromBottom
    const posX = Math.round(playResX / 2)
    const formatTimestamp = (ms: number): string => {
      const safeMs = Math.max(0, Math.floor(ms))
      const totalSeconds = Math.floor(safeMs / 1000)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60
      const centiseconds = Math.floor((safeMs % 1000) / 10)
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
    }

    const assHeader = `[Script Info]
Title: Generated Subtitles
PlayResX: ${playResX}
PlayResY: ${playResY}
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

    const dialogues: string[] = []
    let buffer = ''
    let sentenceStartMs: number | null = null
    let lastEndMs = 0

    const flush = () => {
      const text = buffer.trim()
      if (!text || sentenceStartMs === null) {
        buffer = ''
        sentenceStartMs = null
        return
      }
      const styledText = `{\\pos(${posX},${posY})\\fs${fontSize}\\c&H00FFFFFF\\3c&H000000\\4a&H00}${text.replace(/\n/g, '\\N')}`
      dialogues.push(
        `Dialogue: 0,${formatTimestamp(sentenceStartMs)},${formatTimestamp(Math.max(lastEndMs, sentenceStartMs + 300))},Default,,0,0,0,,${styledText}`,
      )
      buffer = ''
      sentenceStartMs = null
    }

    for (let i = 0; i < this.alignment.characters.length; i += 1) {
      const char = this.alignment.characters[i]
      const start = startsMs[i] ?? lastEndMs
      const end = endsMs[i] ?? Math.max(start + 120, lastEndMs)
      const gap = start - lastEndMs

      if (sentenceStartMs === null) {
        sentenceStartMs = start
      } else if (gap > 500) {
        flush()
        sentenceStartMs = start
      }

      buffer += char
      lastEndMs = end

      if (/[。！？!?；;,\n]/.test(char) || buffer.length >= 26) {
        flush()
      }
    }

    flush()
    return assHeader + dialogues.join('\n')
  }
}

export class ElevenLabsTTS {
  private apiKey: string = ''
  private baseUrl = 'https://api.elevenlabs.io'

  setApiKey(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * 获取语音列表
   * GET https://api.elevenlabs.io/v1/shared-voices
   */
  async getVoices(params?: { pageSize?: number; language?: string; gender?: string; category?: string; age?: string; search?: string }): Promise<GetVoicesResult> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is not set. Please call setApiKey first.')
    }

    const requestParams: Record<string, string | number> = {
      page_size: params?.pageSize ?? 100,
      voice_type: 'default',
    }
    if (params?.language) requestParams.language = params.language
    if (params?.gender) requestParams.gender = params.gender
    if (params?.category) requestParams.category = params.category
    if (params?.age) requestParams.age = params.age
    if (params?.search) requestParams.search = params.search

    const response = await axios.get<VoicesResponse>(`${this.baseUrl}/v1/shared-voices`, {
      headers: { 'xi-api-key': this.apiKey },
      params: requestParams,
      timeout: 30000,
    })

    return {
      voices: response.data.voices,
      hasMore: response.data.has_more,
    }
  }

  /**
   * 文本转语音
   * POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
   *
   * @param text - 要转换的文本
   * @param voiceId - 语音 ID
   * @param options - 合成选项
   * @returns 音频结果
   */
  async synthesize(
    text: string,
    voiceId: string,
    options: SynthesisOptions = {},
  ): Promise<SynthesisResult> {
    return this.requestSynthesis(text, voiceId, options, false)
  }

  async synthesizeWithTimestamps(
    text: string,
    voiceId: string,
    options: SynthesisOptions = {},
  ): Promise<SynthesisResult> {
    return this.requestSynthesis(text, voiceId, options, true)
  }

  private async requestSynthesis(
    text: string,
    voiceId: string,
    options: SynthesisOptions,
    withTimestamps: boolean,
  ): Promise<SynthesisResult> {
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is not set. Please call setApiKey first.')
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty.')
    }

    if (!voiceId) {
      throw new Error('Voice ID is required.')
    }

    const requestBody: Record<string, unknown> = {
      text,
      model_id: options.modelId ?? 'eleven_v2',
      voice_settings: {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarity_boost ?? 0.5,
        style: options.style ?? 0.0,
        use_speaker_boost: options.speaker_boost ?? false,
      },
    }

    if (options.speed !== undefined) {
      requestBody.speed = options.speed
    }

    let audioBuffer: Buffer
    let alignment: CharacterAlignment | undefined

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/text-to-speech/${voiceId}${withTimestamps ? '/with-timestamps' : ''}`,
        requestBody,
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: withTimestamps ? 'json' : 'arraybuffer',
          timeout: 60000,
          params: { output_format: 'mp3_44100_128' },
        },
      )

      if (withTimestamps) {
        const data = response.data as {
          audio_base64: string
          alignment?: CharacterAlignment
          normalized_alignment?: CharacterAlignment
        }
        audioBuffer = Buffer.from(data.audio_base64, 'base64')
        alignment = data.normalized_alignment ?? data.alignment
      } else {
        audioBuffer = Buffer.from(response.data)
      }
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response) {
          const status = error.response.status
          const data = error.response.data
          let detail = ''
          try {
            // data 可能是 Buffer（arraybuffer 响应），也可能是已解析的对象
            const text = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data)
            detail = JSON.parse(text)?.detail ?? text
          } catch {
            detail = Buffer.isBuffer(data) ? data.toString('utf-8') : String(data)
          }
          throw new Error(`ElevenLabs API error ${status}: ${detail}`)
        }
        if (error.code === 'ECONNABORTED') {
          throw new Error('ElevenLabs API request timeout.')
        }
        throw new Error(`ElevenLabs API request failed: ${error.message}`)
      }
      throw error
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error('ElevenLabs returned empty audio.')
    }

    return new SynthesisResultImpl(audioBuffer, alignment)
  }
}
