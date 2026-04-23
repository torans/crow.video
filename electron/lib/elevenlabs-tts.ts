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
}

class SynthesisResultImpl implements SynthesisResult {
  private readonly audioBuffer: Buffer

  constructor(audioData: Buffer) {
    this.audioBuffer = audioData
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

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/text-to-speech/${voiceId}`,
        requestBody,
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 60000,
          params: { output_format: 'mp3_44100_128' },
        },
      )

      audioBuffer = Buffer.from(response.data)
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

    return new SynthesisResultImpl(audioBuffer)
  }
}
