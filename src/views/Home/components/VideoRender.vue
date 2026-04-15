<template>
  <div class="render-panel-wrap h-full">
    <v-sheet class="render-panel">
      <div class="render-panel__header">
        <div class="render-panel__identity">
          <div class="render-panel__identity-title">
            <span class="workbench-section-title">{{ workspaceText('title') }}</span>
          </div>
        </div>
        <v-dialog v-model="configDialogShow" max-width="600" persistent>
          <template v-slot:activator="{ props: activatorProps }">
            <v-btn
              class="render-panel__config-btn"
              v-bind="activatorProps"
              :disabled="taskInProgress"
              variant="tonal"
            >
              {{ t('common.buttons.config') }}
            </v-btn>
          </template>

          <v-card prepend-icon="mdi-text-box-edit-outline" :title="t('dialogs.renderConfig')">
            <v-card-text>
              <div class="w-full flex gap-2 mb-4 items-center">
                <v-text-field
                  :label="t('features.render.config.output.width')"
                  v-model="config.outputSize.width"
                  hide-details
                ></v-text-field>
                <v-text-field
                  v-model="config.outputSize.height"
                  :label="t('features.render.config.output.height')"
                  hide-details
                  required
                ></v-text-field>
              </div>
              <div class="w-full flex gap-2 mb-4 items-center">
                <v-text-field
                  :label="t('features.render.config.output.fileName')"
                  v-model="config.outputFileName"
                  hide-details
                  required
                  clearable
                ></v-text-field>
                <v-text-field
                  class="w-[120px] flex-none"
                  v-model="config.outputFileExt"
                  :label="t('features.render.config.output.format')"
                  hide-details
                  readonly
                  required
                ></v-text-field>
              </div>
              <div class="w-full flex gap-2 mb-4 items-center">
                <v-text-field
                  :label="t('features.render.config.output.folder')"
                  v-model="config.outputPath"
                  hide-details
                  readonly
                  required
                ></v-text-field>
                <v-btn
                  class="!h-[46px]"
                  prepend-icon="mdi-folder-open"
                  @click="handleSelectOutputFolder"
                >
                  {{ t('common.buttons.select') }}
                </v-btn>
              </div>
              <div class="w-full flex gap-2 mb-2 items-center">
                <v-text-field
                  :label="t('features.render.config.bgmFolderLabel')"
                  v-model="config.bgmPath"
                  hide-details
                  readonly
                  required
                  clearable
                ></v-text-field>
                <v-btn
                  class="!h-[46px]"
                  prepend-icon="mdi-folder-open"
                  @click="handleSelectBgmFolder"
                >
                  {{ t('common.buttons.select') }}
                </v-btn>
              </div>
              <v-divider class="my-4"></v-divider>

              <!-- VL 模型配置 -->
              <div class="text-subtitle-2 mb-2">{{ t('features.vl.config.title') }}</div>
              <v-text-field
                :label="t('features.vl.config.modelName')"
                v-model="vlConfig.modelName"
                hide-details
                density="compact"
                class="mb-2"
              ></v-text-field>
              <v-text-field
                :label="t('features.vl.config.apiUrl')"
                v-model="vlConfig.apiUrl"
                hide-details
                density="compact"
                class="mb-2"
              ></v-text-field>
              <v-text-field
                :label="t('features.vl.config.apiKey')"
                v-model="vlConfig.apiKey"
                type="password"
                hide-details
                density="compact"
                class="mb-2"
              ></v-text-field>
              <small class="text-caption text-medium-emphasis">{{
                t('features.vl.config.note')
              }}</small>
            </v-card-text>
            <v-divider></v-divider>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                :text="t('common.buttons.close')"
                variant="plain"
                @click="handleCloseDialog"
              ></v-btn>
              <v-btn
                color="primary"
                :text="t('common.buttons.save')"
                variant="tonal"
                @click="handleSaveConfig"
              ></v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </div>

      <div class="render-panel__content">
        <div class="render-panel__stage workbench-editor-surface">
          <v-progress-circular
            color="primary"
            v-model="renderProgress"
            :indeterminate="taskInProgress && appStore.renderStatus !== RenderStatus.Rendering"
            :size="64"
            :width="4"
          />
          <div class="render-panel__stage-info">
            <v-chip :color="statusChipColor" variant="tonal" size="large">
              {{ statusLabel }}
            </v-chip>
            <v-btn
              v-if="!taskInProgress"
              size="x-large"
              color="primary"
              block
              prepend-icon="mdi-play"
              @click="emit('renderVideo')"
            >
              {{ t('features.render.config.startLabel') }}
            </v-btn>
            <v-btn
              v-else
              color="error"
              size="x-large"
              block
              prepend-icon="mdi-stop"
              @click="emit('cancelRender')"
            >
              {{ t('features.render.config.stopLabel') }}
            </v-btn>
            <div class="render-panel__hint">
              {{ taskInProgress ? workspaceText('runningHint') : workspaceText('idleHint') }}
            </div>
          </div>
        </div>

        <div class="render-panel__actions">
          <v-switch
            v-model="appStore.autoBatch"
            :label="t('features.render.config.autoBatch')"
            density="compact"
            hide-details
            :disabled="taskInProgress"
          />
        </div>
      </div>
      <div class="render-panel__footer">
        <span
          class="text-[12px] cursor-pointer select-none"
          style="color: var(--apple-text-tertiary)"
          @click="handleOpenHomePage"
        >
          {{ t('footer.poweredBy') }}
        </span>
      </div>
    </v-sheet>
  </div>
</template>

<script lang="ts" setup>
import { ref, toRaw, nextTick, computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import { RenderStatus, useAppStore } from '@/store'

const appStore = useAppStore()
const { t, i18next } = useTranslation()

const workspaceFallbacks = {
  kicker: { zh: '生成', en: 'Render' },
  title: { zh: '生成控制塔', en: 'Render Tower' },
  note: {
    zh: '确认状态后开始生成，右侧区域只负责执行与反馈。',
    en: 'Confirm the current status, then start rendering.',
  },
  runningHint: {
    zh: '当前流程正在执行中。',
    en: 'The current pipeline is running.',
  },
  idleHint: {
    zh: '准备完成后即可开始生成。',
    en: 'Everything is ready. Start rendering when you want.',
  },
} as const

const workspaceText = (key: keyof typeof workspaceFallbacks) => {
  const value = t(`features.render.workspace.${key}`) as string
  if (value !== `features.render.workspace.${key}`) return value
  return i18next.language?.startsWith('zh')
    ? workspaceFallbacks[key].zh
    : workspaceFallbacks[key].en
}

const emit = defineEmits<{
  (e: 'renderVideo'): void
  (e: 'cancelRender'): void
}>()

const taskInProgress = computed(() => {
  return (
    appStore.renderStatus !== RenderStatus.None &&
    appStore.renderStatus !== RenderStatus.Completed &&
    appStore.renderStatus !== RenderStatus.Failed
  )
})

const statusLabel = computed(() => {
  const map: Record<string, string> = {
    [RenderStatus.None]: t('features.render.status.idle'),
    [RenderStatus.GenerateText]: t('features.render.status.generatingText'),
    [RenderStatus.SynthesizedSpeech]: t('features.render.status.synthesizingSpeech'),
    [RenderStatus.SegmentVideo]: t('features.render.status.segmentingVideo'),
    [RenderStatus.Rendering]: t('features.render.status.rendering'),
    [RenderStatus.Completed]: t('features.render.status.success'),
    [RenderStatus.Failed]: t('features.render.status.failed'),
  }
  return map[appStore.renderStatus] ?? t('features.render.status.idle')
})

const statusChipColor = computed(() => {
  if (appStore.renderStatus === RenderStatus.Completed) return 'success'
  if (appStore.renderStatus === RenderStatus.Failed) return 'error'
  if (taskInProgress.value) return 'primary'
  return undefined
})

const renderProgress = ref(0)
window.ipcRenderer.on('render-video-progress', (_, progress: number) => {
  renderProgress.value = progress
})

// 配置生成选项
const config = ref(structuredClone(toRaw(appStore.renderConfig)))
if (!config.value.outputFileName) {
  config.value.outputFileName = 'crow-video'
}
const vlConfig = ref(structuredClone(toRaw(appStore.vlConfig)))
const configDialogShow = ref(false)
const resetConfigDialog = () => {
  config.value = structuredClone(toRaw(appStore.renderConfig))
  vlConfig.value = structuredClone(toRaw(appStore.vlConfig))
}
const handleCloseDialog = () => {
  configDialogShow.value = false
  nextTick(resetConfigDialog)
}
const handleSaveConfig = () => {
  appStore.updateRenderConfig(config.value)
  appStore.updateVLConfig(vlConfig.value)
  configDialogShow.value = false
}

// 选择文件夹
const handleSelectOutputFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectOutputFolder'),
    defaultPath: config.value.outputPath,
  })
  console.log('用户选择视频导出文件夹，绝对路径：', folderPath)
  if (folderPath) {
    config.value.outputPath = folderPath
  }
}
const handleSelectBgmFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectBgmFolder'),
    defaultPath: config.value.bgmPath,
  })
  console.log('用户选择背景音乐文件夹，绝对路径：', folderPath)
  if (folderPath) {
    config.value.bgmPath = folderPath
  }
}

const handleOpenHomePage = () => {
  window.electron.openExternal({ url: 'https://crow.video' })
}
</script>

<style lang="scss" scoped>
.render-panel-wrap {
  min-height: 0;
  // flex: 1;
  // display: flex;
  // flex-direction: column;
}

.render-panel {
  flex: 1;
  min-height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.render-panel__header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 100px;
}

.render-panel__identity {
  min-width: 0;
  flex: 1;
}

.render-panel__identity-title {
  display: flex;
  align-items: baseline;
  gap: 8px;

  .workbench-section-kicker {
    margin-bottom: 0;
  }
}

.workbench-section-note {
  margin-top: 4px;
}

.render-panel__config-btn {
  position: absolute;
  top: 0;
  right: 0;
  flex-shrink: 0;
}

.render-panel__content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.render-panel__stage {
  flex: 0 0 auto;
  margin-top: 12px;
  padding: 30px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background:
    radial-gradient(circle at top, rgba(92, 86, 234, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 251, 247, 0.95), rgba(248, 243, 236, 0.92));
}

.render-panel__stage-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.render-panel__hint {
  font-size: 12px;
  color: var(--workbench-text-soft);
  text-align: center;
  line-height: 1.45;
  max-width: 200px;
}

.render-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.render-panel__footer {
  flex-shrink: 0;
  padding-top: 4px;
  display: flex;
  justify-content: center;
}
</style>
