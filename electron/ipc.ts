import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron'
import { sqBulkInsertOrUpdate, sqDelete, sqInsert, sqQuery, sqUpdate } from './sqlite'
import {
  ListFilesFromFolderParams,
  OpenExternalParams,
  SelectFolderParams,
  StatEventParams,
} from './types'
import { ttsSynthesizeToUrl, ttsSynthesizeToFile } from './tts'
import { renderVideo } from './ffmpeg'
import { sendStatEvent } from './lib/stat'
import { testVLConnection } from './vl'
import { analyzeVideoAssets, clearVideoAnalysis } from './vl/analyze-video'
import {
  analyzeProductReference,
  saveProductReference,
  updateProductReference,
  getProductReferences,
  getProductReferenceById,
  deleteProductReference,
  updateProductReferenceAnalysis,
} from './vl/analyze-product'
import { matchVideoSegments, getAnalysisStats } from './vl/match'
import type { VLApiConfig } from './vl/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 使用['ENV_NAME'] 避免 vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

function canUsePath(folderPath?: string | null) {
  if (!folderPath) {
    return false
  }

  try {
    fs.accessSync(folderPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

function tryGetElectronPath(name: Parameters<typeof app.getPath>[0]) {
  try {
    return app.getPath(name)
  } catch (error: any) {
    console.warn(`[select-folder] getPath(${name}) failed:`, error?.message ?? String(error))
    return null
  }
}

function resolveDefaultFolderPath(customPath?: string | null) {
  if (canUsePath(customPath)) {
    return customPath!
  }

  const fallbackPathKeys: Parameters<typeof app.getPath>[0][] = [
    'downloads',
    'desktop',
    'documents',
    'home',
  ]

  for (const key of fallbackPathKeys) {
    const folderPath = tryGetElectronPath(key)
    if (canUsePath(folderPath)) {
      return folderPath
    }
  }

  if (canUsePath(process.cwd())) {
    return process.cwd()
  }

  return null
}

export default function initIPC() {
  // sqlite 查询
  ipcMain.handle('sqlite-query', (_event, params) => sqQuery(params))
  // sqlite 插入
  ipcMain.handle('sqlite-insert', (_event, params) => sqInsert(params))
  // sqlite 更新
  ipcMain.handle('sqlite-update', (_event, params) => sqUpdate(params))
  // sqlite 删除
  ipcMain.handle('sqlite-delete', (_event, params) => sqDelete(params))
  // sqlite 批量插入或更新
  ipcMain.handle('sqlite-bulk-insert-or-update', (_event, params) => sqBulkInsertOrUpdate(params))

  // 是否最大化
  ipcMain.handle('is-win-maxed', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized()
  })
  //最小化
  ipcMain.on('win-min', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })
  //最大化
  ipcMain.on('win-max', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win?.unmaximize()
    } else {
      win?.maximize()
    }
  })
  //关闭程序
  ipcMain.on('win-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // 打开外部链接
  ipcMain.handle('open-external', (_event, params: OpenExternalParams) => {
    shell.openExternal(params.url)
  })

  // 选择文件夹
  ipcMain.handle('select-folder', async (event, params?: SelectFolderParams) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error('无法获取窗口')
    }

    const defaultPath = resolveDefaultFolderPath(params?.defaultPath)

    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: params?.title || '选择文件夹',
    }

    if (defaultPath) {
      dialogOptions.defaultPath = defaultPath
    } else {
      console.warn('[select-folder] all fallback defaultPath attempts unavailable')
    }

    const result = await dialog.showOpenDialog(win, dialogOptions)
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0] // 返回绝对路径
    }
    return null
  })

  // 读取文件夹内所有文件
  ipcMain.handle('list-files-from-folder', async (_event, params: ListFilesFromFolderParams) => {
    const files = await fs.promises.readdir(params.folderPath, { withFileTypes: true })
    return files
      .filter((file) => file.isFile())
      .map((file) => ({
        name: file.name,
        path: path.join(params.folderPath, file.name).replace(/\\/g, '/'),
      }))
  })

  // 语音合成（Qwen TTS）
  ipcMain.handle('tts-synthesize-to-url', (_event, params) => ttsSynthesizeToUrl(params))
  ipcMain.handle('tts-synthesize-to-file', (_event, params) => ttsSynthesizeToFile(params))

  // 统计事件上报
  ipcMain.handle('stat-track', (_event, params: StatEventParams) => sendStatEvent(params))

  // 渲染视频
  ipcMain.handle('render-video', (_event, params) => {
    // 进度回调
    const onProgress = (progress: number) => {
      _event.sender.send('render-video-progress', progress)
    }

    // 创建 AbortController
    const controller = new AbortController()
    // 监听取消事件
    ipcMain.once('cancel-render-video', () => {
      controller.abort()
    })

    return renderVideo({ ...params, onProgress, abortSignal: controller.signal })
  })

  // === VL 视觉大模型相关 ===

  // 测试 VL API 连接
  ipcMain.handle('vl-test-connection', (_event, params: VLApiConfig) => {
    return testVLConnection(params)
  })

  // 分析素材库视频
  ipcMain.handle('vl-analyze-video-assets', (_event, params: { videoPaths: string[]; apiConfig: VLApiConfig; intervalSeconds?: number }) => {
    const controller = new AbortController()

    ipcMain.once('vl-cancel-analysis', () => {
      controller.abort()
    })

    const onProgress = (current: number, total: number) => {
      _event.sender.send('vl-analysis-progress', { current, total })
    }

    return analyzeVideoAssets({
      ...params,
      onProgress,
      abortSignal: controller.signal,
    })
  })

  // 取消分析（由渲染进程发送）
  // 实际取消逻辑通过 ipcMain.once('vl-cancel-analysis') 在上方处理

  // 清除视频分析数据
  ipcMain.handle('vl-clear-video-analysis', (_event, params?: { videoPath?: string }) => {
    return clearVideoAnalysis(params?.videoPath)
  })

  // 获取分析统计
  ipcMain.handle('vl-get-analysis-stats', (_event, params: { videoPaths: string[] }) => {
    return getAnalysisStats(params.videoPaths)
  })

  // 智能匹配选片
  ipcMain.handle('vl-match-video-segments', (_event, params) => {
    console.log('[vl-match-video-segments IPC] 被调用了！params=', JSON.stringify(params, null, 2))
    return matchVideoSegments(params)
  })

  // === 产品参考管理 ===

  // 分析产品参考图片
  ipcMain.handle('vl-analyze-product-reference', (_event, params: { imagePaths: string[]; apiConfig: VLApiConfig }) => {
    return analyzeProductReference(params)
  })

  // 保存产品参考
  ipcMain.handle('vl-save-product-reference', async (_event, params) => {
    try {
      return await saveProductReference(params)
    } catch (e) {
      console.error('vl-save-product-reference error:', e)
      throw e
    }
  })

  // 更新产品参考
  ipcMain.handle('vl-update-product-reference', async (_event, params: { id: string; name: string; imagePaths: string[]; features: string; highlights: string; targetAudience: string }) => {
    try {
      return await updateProductReference(params.id, params)
    } catch (e) {
      console.error('vl-update-product-reference error:', e)
      throw e
    }
  })

  // 更新产品视觉分析结果
  ipcMain.handle('vl-update-product-analysis', (_event, params: { id: string; analysis: { description: string; colors: string[]; tags: string[] } }) => {
    return updateProductReferenceAnalysis(params.id, params.analysis)
  })

  // 获取所有产品参考
  ipcMain.handle('vl-get-product-references', () => {
    return getProductReferences()
  })

  // 获取单个产品参考
  ipcMain.handle('vl-get-product-reference-by-id', (_event, params: { id: string }) => {
    return getProductReferenceById(params.id)
  })

  // 删除产品参考
  ipcMain.handle('vl-delete-product-reference', (_event, params: { id: string }) => {
    return deleteProductReference(params.id)
  })

  // 选择图片文件（用于产品参考上传）
  ipcMain.handle('select-images', async (event, params?: { title?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error('无法获取窗口')
    }

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      title: params?.title || '选择产品图片',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
    })

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths.map((p) => p.replace(/\\/g, '/'))
    }
    return []
  })
}
