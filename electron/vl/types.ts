export interface VLApiConfig {
  apiUrl: string
  apiKey: string
  modelName: string
}

export interface VLAnalysisResult {
  description: string
  colors: string[]
  tags: string[]
  appeal: number
}

export interface AnalyzeImageParams {
  imageBase64: string
  prompt: string
  apiConfig: VLApiConfig
}

export interface AnalyzeProductReferenceParams {
  imagePaths: string[]
  apiConfig: VLApiConfig
}

export interface AnalyzeProductReferenceResult {
  description: string
  colors: string[]
  tags: string[]
}

export interface AnalyzeVideoAssetsParams {
  videoPaths: string[]
  apiConfig: VLApiConfig
  intervalSeconds?: number // default 3
  onProgress?: (current: number, total: number) => void
  abortSignal?: AbortSignal
}

export interface AnalyzeVideoAssetsResult {
  analyzedCount: number
  totalFrames: number
}

export interface MatchVideoSegmentsParams {
  productColors: string[]
  productTags: string[]
  productSceneTags?: string[] // 场景标签，用于场景模式匹配
  targetDuration: number
  videoPaths?: string[] // 可选，指定素材库范围，不传则用全量帧
  text?: string // 文案文本，用于语义对齐选片
  minSegmentDuration?: number // default 2
  maxSegmentDuration?: number // default 15
  matchMode?: 'auto' | 'product' | 'scene' // default 'auto'
  llmConfig?: VLApiConfig // 可选，用于跨语言翻译对齐
}

export interface MatchedSegment {
  videoPath: string
  timestamp: number
  score: number
  appeal: number
}

export interface MatchVideoSegmentsResult {
  videoFiles: string[]
  timeRanges: [string, string][]
}

export interface ProductReferenceRecord {
  id: string
  name: string
  image_paths: string
  features: string
  highlights: string
  target_audience: string
  description: string
  colors: string
  tags: string
  scene_tags: string
  created_at: number
}

export interface VideoFrameAnalysisRecord {
  id: string
  video_path: string
  timestamp: number
  frame_path: string
  description: string
  colors: string
  tags: string
  appeal: number
  analyzed_prompt_version: number
  analyzed_at: number
}
