<template>
  <div class="tts-control h-full">
    <v-form :disabled="disabled">
      <v-sheet class="tts-panel h-full">
        <div class="workbench-section-header tts-panel__header">
          <div class="tts-panel__identity">
            <div class="workbench-section-title">{{ workspaceText('title') }}</div>
          </div>
          <v-dialog v-model="configDialogShow" max-width="500" persistent>
            <template v-slot:activator="{ props: activatorProps }">
              <v-btn v-bind="activatorProps" :disabled="disabled" variant="tonal">
                {{ t('common.buttons.config') }}
              </v-btn>
            </template>
            <v-card prepend-icon="mdi-microphone-settings" :title="t('common.buttons.config')">
              <v-card-text>
                <v-text-field
                  :label="t('features.tts.config.apiKey')"
                  v-model="tempConfig.apiKey"
                  type="password"
                  required
                  clearable
                  hint="阿里云百炼 DashScope API Key"
                  persistent-hint
                ></v-text-field>
                <v-text-field
                  :label="t('features.tts.config.apiUrl')"
                  v-model="tempConfig.apiUrl"
                  required
                  clearable
                ></v-text-field>
                <v-text-field
                  :label="t('features.tts.config.model')"
                  v-model="tempConfig.model"
                  required
                  clearable
                  hint="默认 qwen3-tts-flash"
                  persistent-hint
                ></v-text-field>
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

        <div class="tts-panel__body">
          <div class="tts-panel__grid">
            <v-select
              v-model="appStore.ttsConfig.voice"
              :label="t('features.tts.config.voice')"
              :items="voiceItems"
              item-title="label"
              item-value="name"
              density="compact"
            ></v-select>
            <v-select
              v-model="appStore.ttsConfig.languageType"
              :label="t('features.tts.config.language')"
              :items="languageItems"
              item-title="label"
              item-value="value"
              density="compact"
            ></v-select>
          </div>

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
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onUnmounted, h, toRaw, nextTick } from 'vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import { formatErrorForCopy } from '@/lib/error-copy'
import { QWEN_TTS_VOICES, QWEN_TTS_LANGUAGES } from '~/electron/tts/types'

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

const voiceItems = computed(() => QWEN_TTS_VOICES)
const languageItems = computed(() => QWEN_TTS_LANGUAGES)

const configValid = () => {
  if (!appStore.ttsConfig.apiKey) {
    toast.warning(t('features.tts.errors.apiKeyRequired'))
    return false
  }
  if (!appStore.ttsConfig.voice) {
    toast.warning(t('features.tts.config.selectVoiceWarning'))
    return false
  }
  if (!appStore.tryListeningText) {
    toast.warning(t('features.tts.config.tryTextEmptyWarning'))
    return false
  }
  return true
}

// 试听
const tryListeningLoading = ref(false)
let currentAudio: HTMLAudioElement | null = null
const handleTryListening = async () => {
  if (!configValid()) return

  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }

  tryListeningLoading.value = true
  try {
    const audioUrl = await window.electron.ttsSynthesizeToUrl({
      text: appStore.tryListeningText,
      config: structuredClone(toRaw(appStore.ttsConfig)),
    })
    currentAudio = new Audio(audioUrl)
    currentAudio.play()
    toast.info(t('features.tts.info.playTryAudio'))
  } catch (error: any) {
    console.log('试听语音合成失败', error)
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        render: () =>
          h(ActionToastEmbed, {
            message: t('features.tts.errors.trySynthesisNetwork'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(
                  t('features.tts.errors.trySynthesisNetwork'),
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

onUnmounted(() => {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
})

// 配置弹窗
const configDialogShow = ref(false)
const tempConfig = ref(structuredClone(toRaw(appStore.ttsConfig)))
const handleCloseDialog = () => {
  configDialogShow.value = false
  nextTick(() => {
    tempConfig.value = structuredClone(toRaw(appStore.ttsConfig))
  })
}
const handleSaveConfig = () => {
  appStore.updateTtsConfig(tempConfig.value)
  configDialogShow.value = false
}

// 合成到文件（暴露给外部组件调用）
const synthesizedSpeechToFile = async (option: { text: string }) => {
  if (!appStore.ttsConfig.apiKey) {
    throw new Error(t('features.tts.errors.apiKeyRequired') as string)
  }
  if (!appStore.ttsConfig.voice) {
    throw new Error(t('features.tts.config.selectVoiceWarning') as string)
  }

  try {
    const result = await window.electron.ttsSynthesizeToFile({
      text: option.text,
      config: structuredClone(toRaw(appStore.ttsConfig)),
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
  min-height: 0;
}

.tts-panel {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tts-panel__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.tts-panel__listen {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tts-panel__actions {
  display: flex;
  gap: 10px;
}

.tts-panel__primary-action {
  flex: 1;
}
</style>
