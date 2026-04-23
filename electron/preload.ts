import { ipcRenderer, contextBridge } from 'electron'
import {
  QueryParams,
  InsertParams,
  UpdateParams,
  DeleteParams,
  BulkInsertOrUpdateParams,
} from './sqlite/types'
import {
  ListFilesFromFolderParams,
  OpenExternalParams,
  SelectFolderParams,
  StatEventParams,
} from './types'
import { EdgeTtsSynthesizeToFileParams, ElevenLabsTtsSynthesizeToFileParams } from './tts/types'
import { GetMediaDurationParams, RenderVideoParams } from './ffmpeg/types'
import type { VLApiConfig, MatchVideoSegmentsParams } from './vl/types'

// --------- 向界面渲染进程暴露某些API ---------

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args
    return ipcRenderer.once(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('i18n', {
  getLocalesPath: () => ipcRenderer.invoke('i18n-getLocalesPath'),
  getLanguage: () => ipcRenderer.invoke('i18n-getLanguage'),
  changeLanguage: (lng: string) => ipcRenderer.invoke('i18n-changeLanguage', lng),
})

contextBridge.exposeInMainWorld('electron', {
  isWinMaxed: () => ipcRenderer.invoke('is-win-maxed'),
  winMin: () => ipcRenderer.send('win-min'),
  winMax: () => ipcRenderer.send('win-max'),
  winClose: () => ipcRenderer.send('win-close'),
  openExternal: (params: OpenExternalParams) => ipcRenderer.invoke('open-external', params),
  selectFolder: (params: SelectFolderParams) => ipcRenderer.invoke('select-folder', params),
  listFilesFromFolder: (params: ListFilesFromFolderParams) =>
    ipcRenderer.invoke('list-files-from-folder', params),
  ttsSynthesizeToUrl: (params: any) =>
    ipcRenderer.invoke('tts-synthesize-to-url', params),
  ttsSynthesizeToFile: (params: any) =>
    ipcRenderer.invoke('tts-synthesize-to-file', params),
  // Edge TTS（免费，支持字幕）
  edgeTtsGetVoiceList: () => ipcRenderer.invoke('edge-tts-get-voice-list'),
  edgeTtsSynthesizeToBase64: (params: any) =>
    ipcRenderer.invoke('edge-tts-synthesize-to-base64', params),
  edgeTtsSynthesizeToFile: (params: EdgeTtsSynthesizeToFileParams) =>
    ipcRenderer.invoke('edge-tts-synthesize-to-file', params),
  // ElevenLabs TTS
  elevenlabsTtsSetApiKey: (params: { apiKey: string }) =>
    ipcRenderer.invoke('elevenlabs-tts-set-api-key', params),
  elevenlabsTtsGetVoiceList: (
    params?: { pageSize?: number; language?: string; gender?: string; category?: string; age?: string; search?: string },
  ): Promise<{ voices: any[]; hasMore: boolean }> =>
    ipcRenderer.invoke('elevenlabs-tts-get-voice-list', params),
  elevenlabsTtsSynthesizeToBase64: (params: any) =>
    ipcRenderer.invoke('elevenlabs-tts-synthesize-to-base64', params),
  elevenlabsTtsSynthesizeToFile: (params: ElevenLabsTtsSynthesizeToFileParams) =>
    ipcRenderer.invoke('elevenlabs-tts-synthesize-to-file', params),
  getMediaDuration: (params: GetMediaDurationParams) =>
    ipcRenderer.invoke('get-media-duration', params),
  renderVideo: (params: RenderVideoParams) => ipcRenderer.invoke('render-video', params),
  // LLM 音视频同步匹配
  vlMatchByLLM: (params: {
    subtitleFile: string
    videoAssets: string[]
    productInfo?: { name?: string; features?: string; highlights?: string; targetAudience?: string }
    llmConfig: { apiUrl: string; apiKey: string; modelName: string }
  }) => ipcRenderer.invoke('vl-match-by-llm', params),
  statTrack: (params: StatEventParams) => ipcRenderer.invoke('stat-track', params),
  // VL 视觉大模型相关
  vlTestConnection: (params: VLApiConfig) => ipcRenderer.invoke('vl-test-connection', params),
  vlAnalyzeVideoAssets: (params: { videoPaths: string[]; apiConfig: VLApiConfig; intervalSeconds?: number }) =>
    ipcRenderer.invoke('vl-analyze-video-assets', params),
  vlCancelAnalysis: () => ipcRenderer.send('vl-cancel-analysis'),
  vlClearVideoAnalysis: (params?: { videoPath?: string }) =>
    ipcRenderer.invoke('vl-clear-video-analysis', params),
  vlGetAnalysisStats: (params: { videoPaths: string[] }) =>
    ipcRenderer.invoke('vl-get-analysis-stats', params),
  vlMatchVideoSegments: (params: MatchVideoSegmentsParams) =>
    ipcRenderer.invoke('vl-match-video-segments', params),
  // 产品参考管理
  vlAnalyzeProductReference: (params: { imagePaths: string[]; apiConfig: VLApiConfig }) =>
    ipcRenderer.invoke('vl-analyze-product-reference', params),
  vlSaveProductReference: (params: { name: string; imagePaths: string[]; features: string; highlights: string; targetAudience: string; description?: string; colors?: string[]; tags?: string[]; sceneTags?: string[] }) =>
    ipcRenderer.invoke('vl-save-product-reference', params),
  vlUpdateProductReference: (params: { id: string; name: string; imagePaths: string[]; features: string; highlights: string; targetAudience: string; sceneTags?: string[] }) =>
    ipcRenderer.invoke('vl-update-product-reference', params),
  vlUpdateProductAnalysis: (params: { id: string; analysis: { description: string; colors: string[]; tags: string[] } }) =>
    ipcRenderer.invoke('vl-update-product-analysis', params),
  vlGetProductReferences: () => ipcRenderer.invoke('vl-get-product-references'),
  vlGetProductReferenceById: (params: { id: string }) =>
    ipcRenderer.invoke('vl-get-product-reference-by-id', params),
  vlDeleteProductReference: (params: { id: string }) =>
    ipcRenderer.invoke('vl-delete-product-reference', params),
  selectImages: (params?: { title?: string }) => ipcRenderer.invoke('select-images', params),
})

contextBridge.exposeInMainWorld('sqlite', {
  query: (params: QueryParams) => ipcRenderer.invoke('sqlite-query', params),
  insert: (params: InsertParams) => ipcRenderer.invoke('sqlite-insert', params),
  update: (params: UpdateParams) => ipcRenderer.invoke('sqlite-update', params),
  delete: (params: DeleteParams) => ipcRenderer.invoke('sqlite-delete', params),
  bulkInsertOrUpdate: (params: BulkInsertOrUpdateParams) =>
    ipcRenderer.invoke('sqlite-bulk-insert-or-update', params),
})
