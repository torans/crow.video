<template>
  <div class="tts-control">
    <v-form :disabled="disabled">
      <v-sheet class="tts-panel">
        <div class="workbench-section-header tts-panel__header">
          <div class="tts-panel__identity">
            <div class="workbench-section-title">{{ workspaceText('title') }}</div>
          </div>
          <v-btn
            variant="tonal"
            size="small"
            prepend-icon="mdi-cog-outline"
            @click="configDialogOpen = true"
          >
            {{ t('common.buttons.config') }}
          </v-btn>
        </div>

        <div class="tts-panel__body">
          <ElevenLabsTtsPanel
            @language-change="handleElevenlabsLanguageChange"
          />

          <div class="tts-panel__listen workbench-editor-surface">
            <v-text-field
              v-model="appStore.tryListeningText"
              :label="t('features.tts.config.tryText')"
              density="compact"
            ></v-text-field>
            <div class="tts-panel__actions">
              <v-btn
                class="tts-panel__primary-action"
                prepend-icon="mdi-volume-high"
                :loading="tryListeningLoading"
                :disabled="disabled"
                @click="handleTryListening"
              >
                {{ t('features.tts.config.tryListen') }}
              </v-btn>
            </div>
          </div>
        </div>
      </v-sheet>
    </v-form>

    <v-dialog v-model="configDialogOpen" max-width="720">
      <v-card class="tts-config-dialog" :title="t('features.tts.config.elevenlabsConfigTitle')">
        <v-card-text class="tts-config-dialog__body">
          <v-text-field
            v-model="appStore.ttsConfig.elevenlabsApiKey"
            density="comfortable"
            :label="t('features.tts.config.apiKey')"
            type="password"
            prepend-inner-icon="mdi-key-variant"
            @update:model-value="handleElevenlabsApiKeyChange"
          ></v-text-field>

          <div class="tts-config-dialog__section-title">
            {{ t('features.tts.config.model') }}
          </div>
          <div class="tts-config-dialog__hint">
            {{ t('features.tts.config.subtitleCompatibilityHint') }}
          </div>
          <div class="tts-model-list">
            <button
              v-for="model in modelItems"
              :key="model.value"
              type="button"
              class="tts-model-card"
              :class="{ 'tts-model-card--selected': appStore.ttsConfig.elevenlabsModelId === model.value }"
              @click="appStore.ttsConfig.elevenlabsModelId = model.value"
            >
              <div class="tts-model-card__top">
                <div class="tts-model-card__title-row">
                  <div class="tts-model-card__title">{{ model.label }}</div>
                  <span v-if="model.badge" class="tts-model-card__badge">{{ model.badge }}</span>
                </div>
                <v-icon
                  :icon="appStore.ttsConfig.elevenlabsModelId === model.value ? 'mdi-check-circle-outline' : 'mdi-radiobox-blank'"
                  size="22"
                ></v-icon>
              </div>
              <div class="tts-model-card__desc">{{ model.description }}</div>
              <div class="tts-model-card__chips">
                <span v-for="tag in model.tags" :key="tag" class="tts-model-card__chip">{{ tag }}</span>
              </div>
            </button>
          </div>
          <div class="tts-config-dialog__actions">
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="configDialogOpen = false">{{ t('common.buttons.close') }}</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import { formatErrorForCopy } from '@/lib/error-copy'
import ElevenLabsTtsPanel from '@/components/tts/ElevenLabsTtsPanel.vue'

const elevenLabsCaptionUnsupportedModels = new Set(['eleven_v3'])

const toast = useToast()
const appStore = useAppStore()
const { t, i18next } = useTranslation()

const workspaceFallbacks = {
  title: { zh: '配音控制台', en: 'Voice Console' },
} as const

const workspaceText = (key: keyof typeof workspaceFallbacks) => {
  const value = t(`features.tts.workspace.${key}`) as string
  if (value !== `features.tts.workspace.${key}`) return value
  return i18next.language?.startsWith('zh')
    ? workspaceFallbacks[key].zh
    : workspaceFallbacks[key].en
}

defineProps<{
  disabled?: boolean
}>()

const modelItems = computed(() => [
  {
    label: 'Eleven v3',
    value: 'eleven_v3',
    badge: t('features.tts.config.modelBadgeSubtitleUnsupported'),
    description: t('features.tts.config.modelElevenV3Desc'),
    tags: ['70+ 语言', '表现力强', '仅试听/纯音频'],
  },
  {
    label: 'Eleven Multilingual v2',
    value: 'eleven_multilingual_v2',
    badge: t('features.tts.config.modelBadgeStudio'),
    description: t('features.tts.config.modelMultilingualV2Desc'),
    tags: ['中文', '日语', '英文'],
  },
  {
    label: 'Eleven Flash v2.5',
    value: 'eleven_flash_v2_5',
    badge: t('features.tts.config.modelBadgeFast'),
    description: t('features.tts.config.modelFlashDesc'),
    tags: ['低延迟', '对话场景', '中文'],
  },
])

const configValid = () => {
  if (!appStore.ttsConfig.elevenlabsApiKey) {
    toast.warning(t('features.tts.errors.apiKeyRequired'))
    return false
  }
  if (!appStore.ttsConfig.elevenlabsVoiceId) {
    toast.warning(t('features.tts.config.selectVoiceWarning'))
    return false
  }
  if (!appStore.tryListeningText) {
    toast.warning(t('features.tts.config.tryTextEmptyWarning'))
    return false
  }
  return true
}

const tryListeningLoading = ref(false)
const configDialogOpen = ref(false)
let currentAudio: HTMLAudioElement | null = null

const handleElevenlabsApiKeyChange = async () => {
  appStore.ttsConfig.elevenlabsApiKey = appStore.ttsConfig.elevenlabsApiKey.trim()
  if (appStore.ttsConfig.elevenlabsApiKey) {
    await window.electron.elevenlabsTtsSetApiKey({ apiKey: appStore.ttsConfig.elevenlabsApiKey })
    await fetchElevenlabsVoices()
  }
}

const fetchElevenlabsVoices = async () => {
  if (!appStore.ttsConfig.elevenlabsApiKey) return

  try {
    await window.electron.elevenlabsTtsSetApiKey({ apiKey: appStore.ttsConfig.elevenlabsApiKey })
    const result = await window.electron.elevenlabsTtsGetVoiceList({ pageSize: 50 })
    appStore.elevenlabsVoicesList = result.voices
    console.log('ElevenLabs语音列表获取成功:', appStore.elevenlabsVoicesList.length, '个')
  } catch (error: any) {
    console.log('获取ElevenLabs语音列表失败', error)
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        render: () =>
          h(ActionToastEmbed, {
            message: t('features.tts.errors.fetchVoicesFailed'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(
                  t('features.tts.errors.fetchVoicesFailed'),
                  String(errorMessage),
                ),
              )
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
  }
}

const handleElevenlabsLanguageChange = async (_language: string) => {
  // Language-based voice reloading is handled by ElevenLabsTtsPanel
}

const handleTryListening = async () => {
  if (!configValid()) return

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }

  tryListeningLoading.value = true
  try {
    const speech = await window.electron.elevenlabsTtsSynthesizeToBase64({
      text: appStore.tryListeningText,
      voiceId: appStore.ttsConfig.elevenlabsVoiceId,
      options: {
        speed: appStore.ttsConfig.elevenlabsSpeed,
        modelId: appStore.ttsConfig.elevenlabsModelId,
      },
    })
    currentAudio = new Audio(`data:audio/mp3;base64,${speech}`)
    currentAudio.play()
    toast.info(t('features.tts.info.playTryAudio'))
  } catch (error: any) {
    console.log('试听语音合成失败', error)
    const errorMessage = error?.error?.message || error?.message || error
    const isPaymentError = String(errorMessage).includes('402')
    toast.error({
      component: {
        render: () =>
          h(ActionToastEmbed, {
            message: isPaymentError
              ? t('features.tts.errors.subscriptionRequired')
              : t('features.tts.errors.trySynthesisNetwork'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(
                  isPaymentError
                    ? t('features.tts.errors.subscriptionRequired')
                    : t('features.tts.errors.trySynthesisNetwork'),
                  String(errorMessage),
                ),
              )
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
  } finally {
    tryListeningLoading.value = false
  }
}

onMounted(async () => {
  if (appStore.ttsConfig.elevenlabsApiKey) {
    await fetchElevenlabsVoices()
  }
})

onUnmounted(() => {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
})

// 合成到文件（暴露给外部组件调用）
const synthesizedSpeechToFile = async (option: { text: string; withCaption?: boolean }) => {
  if (!configValid()) throw new Error(t('features.tts.errors.configInvalid') as string)

  if (
    option?.withCaption &&
    elevenLabsCaptionUnsupportedModels.has(appStore.ttsConfig.elevenlabsModelId)
  ) {
    throw new Error(
      '当前 ElevenLabs 模型不支持时间戳字幕，请改用 Eleven Multilingual v2 或 Eleven Flash v2.5。',
    )
  }

  try {
    const result = await window.electron.elevenlabsTtsSynthesizeToFile({
      text: option.text,
      voiceId: appStore.ttsConfig.elevenlabsVoiceId,
      options: {
        speed: appStore.ttsConfig.elevenlabsSpeed,
        modelId: appStore.ttsConfig.elevenlabsModelId,
      },
      withCaption: option?.withCaption,
    })
    return result
  } catch (error) {
    console.log('语音合成失败', error)
    throw new Error(t('features.tts.errors.synthesisFailed') + ' ' + String(error))
  }
}

defineExpose({ synthesizedSpeechToFile })
</script>

<style lang="scss" scoped>
.tts-control {
  min-height: auto;
}

.tts-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tts-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tts-panel__identity {
  min-width: 0;
}

.tts-panel__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tts-panel__listen {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tts-config-dialog__hint {
  margin-bottom: 12px;
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
}

.tts-panel__actions {
  display: flex;
  gap: 10px;
}

.tts-panel__primary-action {
  flex: 1;
}

.tts-config-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tts-config-dialog__section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--workbench-text);
}

.tts-config-dialog__actions {
  display: flex;
  align-items: center;
}

.tts-model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tts-model-card {
  width: 100%;
  border: 1px solid rgba(96, 72, 41, 0.12);
  background: rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
}

.tts-model-card--selected {
  border-color: rgba(90, 78, 200, 0.6);
  box-shadow: 0 12px 28px rgba(90, 78, 200, 0.12);
}

.tts-model-card__top,
.tts-model-card__title-row,
.tts-model-card__chips {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.tts-model-card__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--workbench-text);
}

.tts-model-card__badge,
.tts-model-card__chip {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(80, 57, 30, 0.08);
  color: var(--workbench-text);
  font-size: 12px;
}

.tts-model-card__desc {
  color: var(--workbench-text-soft);
  line-height: 1.6;
}
</style>
