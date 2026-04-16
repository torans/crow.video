/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * 已构建的目录结构
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// 在渲染器进程中使用，在 `preload.ts` 中暴露方法
interface Window {
  ipcRenderer: Pick<import('electron').IpcRenderer, 'on' | 'once' | 'off' | 'send' | 'invoke'>
  i18n: {
    getLocalesPath: () => Promise<string>
    getLanguage: () => Promise<string>
    changeLanguage: (lng: string) => Promise<string>
  }
  electron: {
    isWinMaxed: () => Promise<boolean>
    winMin: () => void
    winMax: () => void
    winClose: () => void
    openExternal: (params: import('./types').OpenExternalParams) => void
    selectFolder: (params: import('./types').SelectFolderParams) => Promise<string>
    listFilesFromFolder: (
      params: import('./types').ListFilesFromFolderParams,
    ) => Promise<import('./types').ListFilesFromFolderRecord[]>
    ttsSynthesizeToUrl: (params: any) => Promise<string>
    ttsSynthesizeToFile: (params: any) => Promise<any>
    // Edge TTS（免费，支持字幕）
    edgeTtsGetVoiceList: () => Promise<any>
    edgeTtsSynthesizeToBase64: (params: any) => Promise<string>
    edgeTtsSynthesizeToFile: (
      params: import('./tts/types').EdgeTtsSynthesizeToFileParams,
    ) => Promise<import('./tts/types').EdgeTtsSynthesizeToFileResult>
    renderVideo: (
      params: import('./ffmpeg/types').RenderVideoParams,
    ) => Promise<import('./ffmpeg/types').ExecuteFFmpegResult>
    statTrack: (params: import('./types').StatEventParams) => Promise<void>
    // VL 视觉大模型相关
    vlTestConnection: (params: import('./vl/types').VLApiConfig) => Promise<boolean>
    vlAnalyzeVideoAssets: (params: {
      videoPaths: string[]
      apiConfig: import('./vl/types').VLApiConfig
      intervalSeconds?: number
    }) => Promise<import('./vl/types').AnalyzeVideoAssetsResult>
    vlCancelAnalysis: () => void
    vlClearVideoAnalysis: (params?: { videoPath?: string }) => Promise<void>
    vlGetAnalysisStats: (params: {
      videoPaths: string[]
    }) => Promise<{ analyzedCount: number; totalCount: number }>
    vlMatchVideoSegments: (
      params: import('./vl/types').MatchVideoSegmentsParams,
    ) => Promise<import('./vl/types').MatchVideoSegmentsResult>
    // 产品参考管理
    vlAnalyzeProductReference: (params: {
      imagePaths: string[]
      apiConfig: import('./vl/types').VLApiConfig
    }) => Promise<import('./vl/types').AnalyzeProductReferenceResult>
    vlSaveProductReference: (params: {
      name: string
      imagePaths: string[]
      features: string
      highlights: string
      targetAudience: string
      description?: string
      colors?: string[]
      tags?: string[]
      sceneTags?: string[]
    }) => Promise<string>
    vlUpdateProductReference: (params: {
      id: string
      name: string
      imagePaths: string[]
      features: string
      highlights: string
      targetAudience: string
      sceneTags?: string[]
    }) => Promise<void>
    vlUpdateProductAnalysis: (params: {
      id: string
      analysis: { description: string; colors: string[]; tags: string[] }
    }) => Promise<void>
    vlGetProductReferences: () => Promise<import('./vl/types').ProductReferenceRecord[]>
    vlGetProductReferenceById: (params: {
      id: string
    }) => Promise<import('./vl/types').ProductReferenceRecord | undefined>
    vlDeleteProductReference: (params: { id: string }) => Promise<void>
    selectImages: (params?: { title?: string }) => Promise<string[]>
  }
  sqlite: {
    query: (param: import('./sqlite/types').QueryParams) => Promise<any>
    insert: (param: import('./sqlite/types').InsertParams) => Promise<number>
    update: (param: import('./sqlite/types').UpdateParams) => Promise<number>
    delete: (param: import('./sqlite/types').DeleteParams) => Promise<void>
    bulkInsertOrUpdate: (param: import('./sqlite/types').BulkInsertOrUpdateParams) => Promise<void>
  }
}
