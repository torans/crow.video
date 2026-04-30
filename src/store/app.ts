import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProductReferenceRecord } from '~/electron/vl/types'

export enum RenderStatus {
  None,
  GenerateText,
  SynthesizedSpeech,
  SegmentVideo,
  Rendering,
  Completed,
  Failed,
}

export const useAppStore = defineStore(
  'app',
  () => {
    // 国际化区域设置
    const locale = ref('')
    const updateLocale = (newLocale: string) => {
      locale.value = newLocale
    }

    // 大模型文案生成
    const prompt = ref('无')
    const llmConfig = ref({
      modelName: 'deepseek-v4-flash',
      apiUrl: 'https://api.deepseek.com/v1',
      apiKey: '',
      language: '中文',
    })
    const updateLLMConfig = (newConfig: typeof llmConfig.value) => {
      llmConfig.value = newConfig
    }

    // 是否为试用版
    const isTrial = true

    // 视频素材管理
    const videoAssetsFolder = ref('')
    const videoExportFolder = ref('')
    // 素材文件路径列表，用于智能匹配选片时限定范围
    const videoAssets = ref<string[]>([])

    // 语音合成（ElevenLabs）
    const ttsConfig = ref({
      elevenlabsApiKey: '',
      elevenlabsVoiceId: '',
      elevenlabsModelId: 'eleven_multilingual_v2',
      elevenlabsSpeed: 1,
    })
    const updateTtsConfig = (newConfig: typeof ttsConfig.value) => {
      ttsConfig.value = newConfig
    }
    const tryListeningText = ref('Hello，欢迎使用乌鸦视频工厂！')

    // ElevenLabs 语音列表
    const elevenlabsVoicesList = ref<any[]>([])

    // 合成配置
    const renderConfig = ref({
      bgmPath: '',
      outputSize: { width: 1080, height: 1920 },
      outputPath: '',
      outputFileName: 'crow-video',
      outputFileExt: '.mp4',
      matchMode: 'product' as 'product' | 'scene',
      llmSyncEnabled: true,
    })
    const autoBatch = ref(false)
    const renderStatus = ref(RenderStatus.None)
    const updateRenderConfig = (newConfig: typeof renderConfig.value) => {
      renderConfig.value = newConfig
    }
    const updateRenderStatus = (newStatus: RenderStatus) => {
      renderStatus.value = newStatus
    }

    // VL 视觉大模型配置
    const vlConfig = ref({
      apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: '',
      modelName: 'qwen-vl-plus',
    })
    const updateVLConfig = (newConfig: typeof vlConfig.value) => {
      vlConfig.value = newConfig
    }

    // 产品参考管理
    const currentProductId = ref<string | null>(null)
    const currentProduct = ref<ProductReferenceRecord | null>(null)
    const updateCurrentProduct = (product: ProductReferenceRecord | null) => {
      currentProduct.value = product
      currentProductId.value = product?.id ?? null
    }

    // 智能匹配
    const smartMatchEnabled = ref(false)
    const analysisStatus = ref<'idle' | 'analyzing' | 'done'>('idle')
    const analysisProgress = ref({ current: 0, total: 0 })

    return {
      locale,
      updateLocale,

      prompt,
      llmConfig,
      updateLLMConfig,
      isTrial,

      videoAssetsFolder,
      videoExportFolder,
      videoAssets,

      ttsConfig,
      updateTtsConfig,
      tryListeningText,

      elevenlabsVoicesList,

      renderConfig,
      autoBatch,
      renderStatus,
      updateRenderConfig,
      updateRenderStatus,

      vlConfig,
      updateVLConfig,
      currentProductId,
      currentProduct,
      updateCurrentProduct,
      smartMatchEnabled,
      analysisStatus,
      analysisProgress,
    }
  },
  {
    persist: {
      omit: [
        'autoBatch',
        'renderStatus',
        'analysisStatus',
        'analysisProgress',
        'currentProduct',
        'videoAssets',
        'elevenlabsVoicesList',
      ],
    },
  },
)
