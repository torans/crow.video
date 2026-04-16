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
                <v-combobox
                  v-model="appStore.language"
                  density="compact"
                  :label="t('features.tts.config.language')"
                  :items="languageItems"
                  :no-data-text="t('common.states.noData')"
                  @update:model-value="clearVoice"
                ></v-combobox>
                <v-select
                  v-model="appStore.gender"
                  density="compact"
                  :label="t('features.tts.config.gender')"
                  :items="genderItems"
                  item-title="label"
                  item-value="value"
                  @update:model-value="clearVoice"
                ></v-select>
                <v-select
                  v-model="appStore.voice"
                  density="compact"
                  :label="t('features.tts.config.voice')"
                  :items="filteredVoicesList"
                  item-title="FriendlyName"
                  return-object
                  :no-data-text="t('features.tts.config.selectLanguageGenderFirst')"
                ></v-select>
                <v-select
                  v-model="appStore.speed"
                  density="compact"
                  :label="t('features.tts.config.speed')"
                  :items="speedItems"
                  item-title="label"
                  item-value="value"
                ></v-select>
              </v-card-text>
              <v-divider></v-divider>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                  :text="t('common.buttons.close')"
                  variant="plain"
                  @click="configDialogShow = false"
                ></v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>

        <div class="tts-panel__body">
          <div class="tts-panel__grid">
            <v-select
              v-model="appStore.voice"
              :label="t('features.tts.config.voice')"
              :items="filteredVoicesList"
              item-title="FriendlyName"
              return-object
              density="compact"
              :no-data-text="t('features.tts.config.selectLanguageGenderFirst')"
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
import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import { formatErrorForCopy } from '@/lib/error-copy'

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

const configValid = () => {
  if (!appStore.voice) {
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
    const speech = await window.electron.edgeTtsSynthesizeToBase64({
      text: appStore.tryListeningText,
      voice: appStore.voice!.ShortName,
      options: {
        rate: appStore.speed,
      },
    })
    currentAudio = new Audio(`data:audio/mp3;base64,${speech}`)
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

const clearVoice = () => {
  appStore.voice = null
}

const filteredVoicesList = computed(() => {
  if (!appStore.language || !appStore.gender) return []
  return appStore.originalVoicesList.filter(
    (v: any) =>
      v.FriendlyName.includes(appStore.language!) && v.Gender === appStore.gender,
  )
})

const genderItems = computed(() => [
  { label: t('features.tts.config.genderFemale'), value: 'Female' },
  { label: t('features.tts.config.genderMale'), value: 'Male' },
])

const languageItems = computed(() => {
  const locales = new Set<string>()
  for (const v of appStore.originalVoicesList) {
    const lang = v.Locale.replace(/-[A-Z]{2}$/, '')
    locales.add(lang)
  }
  return [...locales].sort()
})

const speedItems = computed(() => [
  { label: t('features.tts.config.speedSlow'), value: -30 },
  { label: t('features.tts.config.speedMedium'), value: 0 },
  { label: t('features.tts.config.speedFast'), value: 30 },
])

const fetchVoices = async () => {
  try {
    appStore.originalVoicesList = await window.electron.edgeTtsGetVoiceList()
    console.log('EdgeTTS语音列表获取成功:', appStore.originalVoicesList.length, '个')
  } catch (error: any) {
    console.log('获取EdgeTTS语音列表失败', error)
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

onMounted(async () => {
  await fetchVoices()
  if (appStore.voice && !appStore.originalVoicesList.find((v: any) => v.Name === appStore.voice?.Name)) {
    appStore.voice = null
  }
})

onUnmounted(() => {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
})

// 配置弹窗
const configDialogShow = ref(false)

// 合成到文件（暴露给外部组件调用）
const synthesizedSpeechToFile = async (option: { text: string; withCaption?: boolean }) => {
  if (!configValid()) throw new Error(t('features.tts.errors.configInvalid') as string)

  try {
    const result = await window.electron.edgeTtsSynthesizeToFile({
      text: option.text,
      voice: appStore.voice!.ShortName,
      options: {
        rate: appStore.speed,
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
