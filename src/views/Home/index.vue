<template>
  <div class="home-workbench">
    <div class="home-titlebar window-drag">
      <div class="window-control-bar-no-drag-mask"></div>
    </div>

    <div class="home-workbench__body">
      <section class="home-column home-column--creative">
        <div class="home-column-stack home-column-stack--creative-top">
          <ProductReference />
        </div>
        <div class="home-column-stack home-column-stack--creative-bottom">
          <TextGenerate
            ref="TextGenerateInstance"
            :disabled="appStore.renderStatus === RenderStatus.GenerateText"
          />
        </div>
      </section>

      <section class="home-column home-column--assets">
        <VideoManage
          ref="VideoManageInstance"
          :disabled="appStore.renderStatus === RenderStatus.SegmentVideo"
        />
      </section>

      <section class="home-column home-column--execute">
        <div class="home-column-stack home-column-stack--execute-top">
          <TtsControl
            ref="TtsControlInstance"
            :disabled="appStore.renderStatus === RenderStatus.SynthesizedSpeech"
          />
        </div>
        <div class="home-column-stack home-column-stack--execute-bottom">
          <VideoRender @render-video="handleRenderVideo" @cancel-render="handleCancelRender" />
        </div>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
import TextGenerate from './components/TextGenerate.vue'
import VideoManage from './components/VideoManage.vue'
import TtsControl from './components/TtsControl.vue'
import VideoRender from './components/VideoRender.vue'
import ProductReference from './components/ProductReference.vue'

import { h, ref } from 'vue'
import { RenderStatus, useAppStore } from '@/store'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import type { ListFilesFromFolderRecord } from '~/electron/types'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import random from 'random'
import { formatErrorForCopy } from '@/lib/error-copy'
import { chooseMatchingStrategy } from '@/lib/video-matching-mode'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

const buildStatPayload = (title: string) => ({
  title,
  language: navigator.language,
  screen: `${window.screen.width}x${window.screen.height}`,
  userAgent: navigator.userAgent,
})

const trackStat = (title: string) => {
  window.electron.statTrack(buildStatPayload(title)).catch(() => {})
}

// 构建产品上下文，用于注入 LLM prompt
const buildProductContext = (): string | undefined => {
  const product = appStore.currentProduct
  if (!product) return undefined

  const parts: string[] = []
  parts.push(`你是一个短视频带货文案。请严格遵守以下规则：`)
  parts.push(`1. 只输出口播文案正文，不要输出标题、标签、分段、markdown格式`)
  parts.push(`2. 只能基于下方产品信息合理展开，**绝对禁止编造任何参数**。不写具体尺寸、重量、数值、百分比，用感受型对比代替，如"更细""更轻""顺滑得多""明显更远"。同时不使用市井推销话术（禁止"闭眼冲""安排""打龟""封神"等词汇）`)
  parts.push(`3. **字数严格控制在80-120字**，超过120字就是不合格。中文语速约3-4字/秒，必须在20-30秒内读完`)
  parts.push(`4. 每句话要包含可被镜头呈现的具体信息（动作、对比、变化、细节），方便后续选片匹配`)
  parts.push(`5. 写文案时必须遵循以下镜头结构——前1-2句要支撑高光吸睛画面，中段交替安排场景实战和产品展示描述，至少1句描述产品细节，至少2-4句描述使用场景，结尾自然引导下单，**禁止编造配送时效和效果承诺**（如"明天到""三天见效"）`)
  parts.push(``)
  parts.push(`产品信息：`)
  parts.push(`产品名称：${product.name}`)
  if (product.features) parts.push(`核心功能：${product.features}`)
  if (product.highlights) parts.push(`产品亮点：${product.highlights}`)
  if (product.target_audience) parts.push(`目标受众：${product.target_audience}`)
  if (product.description) parts.push(`产品外观：${product.description}`)

  return parts.join('\n')
}

// 渲染合成视频
const TextGenerateInstance = ref<InstanceType<typeof TextGenerate> | null>()
const VideoManageInstance = ref<InstanceType<typeof VideoManage> | null>()
const TtsControlInstance = ref<InstanceType<typeof TtsControl> | null>()
const handleRenderVideo = async () => {
  if (!appStore.renderConfig.outputFileName) {
    toast.warning(t('features.render.errors.outputFileNameRequired'))
    return
  }
  if (!appStore.renderConfig.outputPath) {
    toast.warning(t('features.render.errors.outputPathRequired'))
    return
  }
  if (!appStore.renderConfig.outputSize?.width || !appStore.renderConfig.outputSize?.height) {
    toast.warning(t('features.render.errors.outputSizeRequired'))
    return
  }

  let randomBgm: ListFilesFromFolderRecord | undefined = undefined
  if (appStore.renderConfig.bgmPath) {
    try {
      const bgmList = (
        await window.electron.listFilesFromFolder({
          folderPath: appStore.renderConfig.bgmPath.replace(/\\/g, '/'),
        })
      ).filter((asset) => asset.name.toLowerCase().endsWith('.mp3'))
      console.log('获取到的背景音乐列表', bgmList)
      if (bgmList.length > 0) {
        randomBgm = random.choice(bgmList)
        console.log('随机选取的背景音乐', randomBgm)
      }
    } catch (error: any) {
      console.log('获取背景音乐列表失败', error)
      const errorMessage = error?.error?.message || error?.message || error
      toast.error({
        component: {
          // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
          render: () =>
            h(ActionToastEmbed, {
              message: t('features.render.errors.bgmListFailed'),
              detail: String(errorMessage),
              actionText: t('common.buttons.copyErrorDetail'),
              onActionTirgger: () => {
                navigator.clipboard.writeText(
                  formatErrorForCopy(
                    t('features.render.errors.bgmListFailed'),
                    String(errorMessage),
                  ),
                )
                toast.success(t('common.messages.success.copySuccess'))
              },
            }),
        },
      })
      return
    }
  }

  try {
    trackStat('开始渲染视频')

    // 获取文案
    appStore.updateRenderStatus(RenderStatus.GenerateText)
    const text =
      TextGenerateInstance.value?.getCurrentOutputText() ||
      (await TextGenerateInstance.value?.handleGenerate({
        productContext: buildProductContext(),
      }))!

    // TTS合成语音
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.GenerateText) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.SynthesizedSpeech)
    const ttsResult = await TtsControlInstance.value?.synthesizedSpeechToFile({
      text,
      withCaption: true,
    })
    console.log(
      '[render] TTS结果:',
      JSON.stringify({
        duration: ttsResult?.duration,
        voicePath: ttsResult?.voicePath,
        textLength: text.length,
      }),
    )
    if (ttsResult?.duration === undefined) {
      throw new Error(t('features.tts.errors.fileCorrupt'))
    }
    if (ttsResult?.duration === 0) {
      throw new Error(t('features.tts.errors.zeroDuration'))
    }

    // 获取视频片段（智能匹配或随机）
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SynthesizedSpeech) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.SegmentVideo)

    let videoSegments: { videoFiles: string[]; timeRanges: [string, string][] } | null = null

    const matchStrategy = chooseMatchingStrategy({
      llmSyncEnabled: appStore.renderConfig.llmSyncEnabled,
      smartMatchEnabled: appStore.smartMatchEnabled,
      hasCurrentProduct: !!appStore.currentProduct,
    })

    // 尝试智能匹配选片
    if (matchStrategy !== 'random' && appStore.currentProduct) {
      try {
        let productColors: string[] = []
        let productTags: string[] = []
        let productSceneTags: string[] = []
        try {
          productColors = JSON.parse(appStore.currentProduct.colors)
        } catch {}
        try {
          productTags = JSON.parse(appStore.currentProduct.tags)
        } catch {}
        try {
          productSceneTags = JSON.parse(appStore.currentProduct.scene_tags)
        } catch {}

        if (productColors.length > 0 || productTags.length > 0) {
          const matched =
            matchStrategy === 'llm' && ttsResult.subtitlePath
              ? await window.electron.vlMatchByLLM({
                  subtitleFile: ttsResult.subtitlePath,
                  videoAssets: appStore.videoAssets,
                  targetDuration: ttsResult.duration,
                  productInfo: {
                    name: appStore.currentProduct.name,
                    features: appStore.currentProduct.features,
                    highlights: appStore.currentProduct.highlights,
                    targetAudience: appStore.currentProduct.target_audience,
                  },
                  llmConfig: {
                    apiUrl: appStore.llmConfig.apiUrl,
                    apiKey: appStore.llmConfig.apiKey,
                    modelName: appStore.llmConfig.modelName,
                  },
                })
              : await window.electron.vlMatchVideoSegments({
                  productColors,
                  productTags,
                  productSceneTags,
                  targetDuration: ttsResult.duration,
                  videoPaths: appStore.videoAssets.length > 0 ? appStore.videoAssets : undefined,
                  text,
                  matchMode: appStore.renderConfig.matchMode,
                })
          // 只在匹配到足够片段时使用智能匹配结果
          if (matched.videoFiles.length > 0) {
            // 计算匹配到的总时长
            let matchedDuration = 0
            for (const [s, e] of matched.timeRanges) {
              matchedDuration += parseFloat(e) - parseFloat(s)
            }
            // 如果匹配时长 >= 目标的 80%，直接使用；否则回退到随机
            if (matchedDuration >= ttsResult.duration * 0.8) {
              videoSegments = matched
              console.log(`使用${matchStrategy === 'llm' ? 'LLM语义' : '智能'}匹配选片，匹配时长:`, matchedDuration)
            }
          }
        }
      } catch (e) {
        console.warn(`${matchStrategy === 'llm' ? 'LLM语义匹配' : '智能匹配'}失败，回退到随机选片:`, e)
      }
    }

    // 回退到随机选片
    if (!videoSegments) {
      videoSegments =
        (await VideoManageInstance.value?.getVideoSegments({
          duration: ttsResult.duration,
        })) ?? null
    }
    console.log(
      '[render] 分镜结果:',
      JSON.stringify({
        requestedDuration: ttsResult.duration,
        segmentCount: videoSegments?.videoFiles.length ?? 0,
      }),
    )

    if (!videoSegments) {
      throw new Error('无法获取视频片段')
    }

    await new Promise((resolve) => setTimeout(resolve, random.integer(1000, 3000)))

    // 合成视频
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SegmentVideo) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.Rendering)
    await window.electron.renderVideo({
      ...videoSegments,
      audioFiles: {
        voice: ttsResult.voicePath,
        bgm: randomBgm?.path,
      },
      subtitleFile: ttsResult.subtitlePath,
      outputSize: {
        width: appStore.renderConfig.outputSize.width,
        height: appStore.renderConfig.outputSize.height,
      },
      outputDuration: String(ttsResult.duration),
      outputPath:
        appStore.renderConfig.outputPath.replace(/\\/g, '/') +
        '/' +
        appStore.renderConfig.outputFileName +
        '_' +
        new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) +
        appStore.renderConfig.outputFileExt,
    })

    toast.success(t('features.render.success.succeeded'))
    trackStat('视频渲染成功')
    appStore.updateRenderStatus(RenderStatus.Completed)

    if (appStore.autoBatch) {
      toast.info(t('features.render.info.batchNext'))
      TextGenerateInstance.value?.clearOutputText()
      handleRenderVideo()
    }
  } catch (error: any) {
    console.error('视频合成失败:', error)
    trackStat('视频渲染失败')
    if (appStore.renderStatus === RenderStatus.None) return
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('features.render.errors.failed'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(t('features.render.errors.failed'), String(errorMessage)),
              )
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
    appStore.updateRenderStatus(RenderStatus.Failed)
  }
}
const handleCancelRender = () => {
  console.log('视频合成终止')
  if (appStore.renderStatus !== RenderStatus.None) {
    trackStat('视频渲染取消')
  }
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      TextGenerateInstance.value?.handleStopGenerate()
      break

    case RenderStatus.SynthesizedSpeech:
      break

    case RenderStatus.SegmentVideo:
      break

    case RenderStatus.Rendering:
      window.ipcRenderer.send('cancel-render-video')
      break

    default:
      break
  }
  appStore.updateRenderStatus(RenderStatus.None)
  toast.info(t('features.render.info.canceled'))
}
</script>

<style lang="scss" scoped>
.home-workbench {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.home-workbench::before {
  content: '';
  position: absolute;
  inset: 52px 18px 18px;
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0.08));
  border: 1px solid rgba(255, 255, 255, 0.35);
  pointer-events: none;
  opacity: 0.7;
}

.home-titlebar {
  width: 100%;
  height: 38px;
  position: relative;
  z-index: 1;
  border-bottom: 1px solid rgba(70, 52, 31, 0.06);
}

.home-workbench__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(430px, 1.12fr) minmax(360px, 0.94fr) minmax(320px, 0.8fr);
  gap: 16px;
  padding: 16px;
  position: relative;
  z-index: 1;
}

.home-column {
  min-width: 0;
  min-height: 0;
}

.home-column--creative {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.home-column--execute {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.home-column-stack {
  min-height: 0;
}

.home-column-stack--creative-top {
  flex: 0 0 43%;
  min-height: 260px;
}

.home-column-stack--creative-bottom {
  flex: 1;
}

.home-column-stack--execute-top {
  flex: 0 0 390px;
  min-height: 390px;
  overflow: hidden;
}

.home-column-stack--execute-bottom {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.home-column--assets,
.home-column--execute > :last-child {
  min-height: 0;
}
</style>
