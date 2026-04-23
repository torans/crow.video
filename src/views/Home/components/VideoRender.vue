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

      <div class="render-panel__content workbench-editor-surface">
        <div class="render-panel__status-row">
          <div class="render-panel__status-copy">
            <v-chip :color="statusChipColor" variant="tonal" size="small">
              {{ statusLabel }}
            </v-chip>
            <div class="render-panel__hint">
              {{ taskInProgress ? workspaceText('runningHint') : workspaceText('idleHint') }}
            </div>
          </div>
          <div class="render-panel__progress">
            <v-progress-circular
              color="primary"
              v-model="renderProgress"
              :indeterminate="taskInProgress && appStore.renderStatus !== RenderStatus.Rendering"
              :size="42"
              :width="4"
            />
          </div>
        </div>

        <div class="render-panel__controls-row">
          <v-btn
            v-if="!taskInProgress"
            size="large"
            color="primary"
            class="render-panel__primary-btn"
            prepend-icon="mdi-play"
            @click="emit('renderVideo')"
          >
            {{ t('features.render.config.startLabel') }}
          </v-btn>
          <v-btn
            v-else
            color="error"
            size="large"
            class="render-panel__primary-btn"
            prepend-icon="mdi-stop"
            @click="emit('cancelRender')"
          >
            {{ t('features.render.config.stopLabel') }}
          </v-btn>
        </div>

        <div class="render-panel__toggles">
          <div class="render-panel__toggle-item">
            <div class="render-panel__toggle-copy">
              <div class="render-panel__toggle-title">{{ t('features.render.config.llmSyncEnabled') }}</div>
            </div>
            <v-switch
              v-model="appStore.renderConfig.llmSyncEnabled"
              density="compact"
              hide-details
              inset
              :disabled="taskInProgress"
            />
          </div>
          <div class="render-panel__toggle-item">
            <div class="render-panel__toggle-copy">
              <div class="render-panel__toggle-title">{{ t('features.render.config.autoBatch') }}</div>
            </div>
            <v-switch
              v-model="appStore.autoBatch"
              density="compact"
              hide-details
              inset
              :disabled="taskInProgress"
            />
          </div>
        </div>
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

</script>

<style lang="scss" scoped>
.render-panel-wrap {
  min-height: 0;
  height: 100%;
}

.render-panel {
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.render-panel__header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 88px;
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.render-panel__status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.render-panel__status-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.render-panel__progress {
  flex: 0 0 auto;
}

.render-panel__controls-row {
  display: flex;
  align-items: center;
}

.render-panel__primary-btn {
  width: 100%;
  min-height: 46px;
}

.render-panel__hint {
  font-size: 12px;
  color: var(--workbench-text-soft);
  line-height: 1.45;
}

.render-panel__toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.render-panel__toggle-item {
  min-width: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(96, 72, 41, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.render-panel__toggle-copy {
  min-width: 0;
}

.render-panel__toggle-title {
  font-size: 13px;
  line-height: 1.3;
  color: var(--workbench-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

</style>
