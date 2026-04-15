import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { app } from 'electron'
import { executeFFmpeg } from '../ffmpeg'
import { analyzeImage, FRAME_ANALYSIS_PROMPT } from './index'
import { sqQuery, sqInsert, sqDelete } from '../sqlite'
import type {
  AnalyzeVideoAssetsParams,
  AnalyzeVideoAssetsResult,
  VideoFrameAnalysisRecord,
} from './types'

/**
 * Get the cache directory for extracted frames
 */
function getFrameCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'frame-cache')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * Extract frames from a video using FFmpeg
 * Returns array of { framePath, timestamp } for each extracted frame
 */
export async function extractFrames(
  videoPath: string,
  intervalSeconds: number = 3,
): Promise<Array<{ framePath: string; timestamp: number }>> {
  const cacheDir = getFrameCacheDir()
  const videoHash = crypto.createHash('md5').update(videoPath).digest('hex').slice(0, 12)
  const frameDir = path.join(cacheDir, videoHash)

  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true })
  }

  const outputPattern = path.join(frameDir, 'frame_%04d.jpg').replace(/\\/g, '/')

  // Extract frames with FFmpeg
  await executeFFmpeg([
    '-i',
    videoPath,
    '-vf',
    `fps=1/${intervalSeconds}`,
    '-q:v',
    '2',
    '-y',
    outputPattern,
  ])

  // Read extracted frames and compute timestamps
  const frames: Array<{ framePath: string; timestamp: number }> = []
  const files = fs.readdirSync(frameDir).filter((f: string) => f.startsWith('frame_') && f.endsWith('.jpg'))
  files.sort()

  for (let i = 0; i < files.length; i++) {
    frames.push({
      framePath: path.join(frameDir, files[i]).replace(/\\/g, '/'),
      timestamp: i * intervalSeconds,
    })
  }

  return frames
}

/**
 * Concurrency-limited async executor
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++
      results[currentIndex] = await tasks[currentIndex]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Analyze video assets: extract frames and analyze each with VL model
 */
export async function analyzeVideoAssets(
  params: AnalyzeVideoAssetsParams,
): Promise<AnalyzeVideoAssetsResult> {
  const { videoPaths, apiConfig, intervalSeconds = 3, onProgress, abortSignal } = params

  let analyzedCount = 0
  let totalFrames = 0

  console.log(`[VL分析] 开始分析 ${videoPaths.length} 个视频, 抽帧间隔=${intervalSeconds}s`)
  console.log(`[VL分析] API配置: url=${apiConfig.apiUrl}, model=${apiConfig.modelName}`)

  for (const videoPath of videoPaths) {
    if (abortSignal?.aborted) {
      console.log(`[VL分析] 已取消`)
      break
    }

    console.log(`[VL分析] 处理视频 [${analyzedCount + 1}/${videoPaths.length}]: ${videoPath}`)

    // Check if already analyzed (incremental)
    const existing = await sqQuery({
      sql: 'SELECT COUNT(*) as count FROM video_frame_analysis WHERE video_path = ?',
      params: [videoPath],
    })
    if (existing[0]?.count > 0) {
      console.log(`[VL分析] 跳过已分析视频 (${existing[0].count} 帧): ${videoPath}`)
      analyzedCount++
      onProgress?.(analyzedCount, videoPaths.length)
      continue
    }

    // Extract frames
    let frames: Array<{ framePath: string; timestamp: number }>
    try {
      console.log(`[VL分析] 正在抽帧...`)
      frames = await extractFrames(videoPath, intervalSeconds)
      console.log(`[VL分析] 抽帧完成, 共 ${frames.length} 帧`)
    } catch (error) {
      console.error(`[VL分析] 抽帧失败: ${videoPath}`, error)
      analyzedCount++
      onProgress?.(analyzedCount, videoPaths.length)
      continue
    }

    if (frames.length === 0) {
      console.log(`[VL分析] 无帧可分析, 跳过`)
      analyzedCount++
      onProgress?.(analyzedCount, videoPaths.length)
      continue
    }

    totalFrames += frames.length

    // Analyze frames with concurrency limit
    let frameIdx = 0
    const tasks = frames.map((frame) => async () => {
      if (abortSignal?.aborted) return

      const currentIdx = ++frameIdx
      try {
        console.log(`[VL分析] 分析帧 [${currentIdx}/${frames.length}] ts=${frame.timestamp}s`)
        const imageBuffer = fs.readFileSync(frame.framePath)
        const imageBase64 = imageBuffer.toString('base64')

        const result = await analyzeImage({
          imageBase64,
          prompt: FRAME_ANALYSIS_PROMPT,
          apiConfig,
        })

        console.log(`[VL分析] 帧 ${currentIdx} 结果: desc="${result.description}", colors=${JSON.stringify(result.colors)}, tags=${JSON.stringify(result.tags)}, appeal=${result.appeal}`)

        const id = crypto.randomUUID()
        await sqInsert({
          table: 'video_frame_analysis',
          data: {
            id,
            video_path: videoPath,
            timestamp: frame.timestamp,
            frame_path: frame.framePath,
            description: result.description,
            colors: JSON.stringify(result.colors),
            tags: JSON.stringify(result.tags),
            appeal: result.appeal,
            analyzed_at: Date.now(),
          },
        })
        console.log(`[VL分析] 帧 ${currentIdx} 已写入数据库`)
      } catch (error) {
        console.error(`[VL分析] 帧 ${currentIdx} 分析失败:`, error)
      }
    })

    console.log(`[VL分析] 开始并发分析 ${frames.length} 帧 (并发数=3)`)
    await runWithConcurrency(tasks, 3)
    console.log(`[VL分析] 视频分析完成: ${videoPath}`)

    analyzedCount++
    onProgress?.(analyzedCount, videoPaths.length)
  }

  console.log(`[VL分析] 全部完成! 分析了 ${analyzedCount} 个视频, 共 ${totalFrames} 帧`)

  return { analyzedCount, totalFrames }
}

/**
 * Clear analysis data for a specific video or all videos
 */
export async function clearVideoAnalysis(videoPath?: string): Promise<void> {
  if (videoPath) {
    // Get frame paths to clean up
    const frames = (await sqQuery({
      sql: 'SELECT frame_path FROM video_frame_analysis WHERE video_path = ?',
      params: [videoPath],
    })) as Pick<VideoFrameAnalysisRecord, 'frame_path'>[]

    // Delete frame files
    for (const frame of frames) {
      if (frame.frame_path && fs.existsSync(frame.frame_path)) {
        try {
          fs.unlinkSync(frame.frame_path)
        } catch {}
      }
    }

    await sqDelete({
      table: 'video_frame_analysis',
      condition: `video_path = '${videoPath.replace(/'/g, "''")}'`,
    })
  } else {
    // Clear all
    const cacheDir = getFrameCacheDir()
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true })
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    await sqDelete({
      table: 'video_frame_analysis',
      condition: '1=1',
    })
  }
}
