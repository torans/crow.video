<template>
  <div class="tts-elevenlabs workbench-editor-surface">
    <div class="tts-elevenlabs__summary">
      <div class="tts-elevenlabs__label">{{ t('features.tts.config.voice') }}</div>
      <button type="button" class="tts-elevenlabs__picker" @click="voiceDialogOpen = true">
        <div class="tts-elevenlabs__picker-main">
          <div class="tts-elevenlabs__picker-title">
            {{ selectedVoice?.name || t('features.tts.config.chooseVoice') }}
          </div>
        </div>
        <v-icon icon="mdi-chevron-right" size="18"></v-icon>
      </button>
    </div>

    <v-select
      v-model="appStore.ttsConfig.elevenlabsSpeed"
      density="compact"
      :label="t('features.tts.config.speed')"
      :items="speedItems"
      item-title="label"
      item-value="value"
    ></v-select>

    <v-dialog v-model="voiceDialogOpen" max-width="920">
      <v-card class="voice-dialog">
        <div class="voice-dialog__header">
          <div class="voice-dialog__title"> ElevenLabs 声音选择</div>
          <v-btn icon="mdi-close" variant="text" @click="voiceDialogOpen = false"></v-btn>
        </div>

        <div class="voice-dialog__toolbar">
          <v-text-field
            v-model="searchQuery"
            class="voice-dialog__search"
            density="comfortable"
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            hide-details
            placeholder="搜索声音"
          ></v-text-field>
        </div>

        <div class="voice-dialog__filters">
          <v-select
            v-model="selectedGender"
            :items="genderOptions"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            label="性别"
            class="voice-dialog__filter-select"
            @update:model-value="onFilterChange"
          ></v-select>
          <v-select
            v-model="selectedCategory"
            :items="categoryOptions"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            label="类别"
            class="voice-dialog__filter-select"
            @update:model-value="onFilterChange"
          ></v-select>
          <v-select
            v-model="selectedAge"
            :items="ageOptions"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            label="年龄"
            class="voice-dialog__filter-select"
            @update:model-value="onFilterChange"
          ></v-select>
          <v-select
            v-model="selectedLanguage"
            :items="languageOptions"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            label="语言"
            class="voice-dialog__filter-select voice-dialog__filter-select--language"
            :no-data-text="'加载语言中…'"
            @update:model-value="onFilterChange"
          ></v-select>
        </div>

        <div v-if="activeChipLabels.length" class="voice-dialog__active-chips">
          <v-chip
            v-for="label in activeChipLabels"
            :key="label"
            size="small"
            closable
            color="primary"
            variant="flat"
            @click:close="removeChip(label)"
          >
            {{ label }}
          </v-chip>
        </div>

        <div class="voice-dialog__list" @scroll.passive="handleListScroll">
          <button
            v-for="voice in visibleVoices"
            :key="voice.voice_id"
            type="button"
            class="voice-row"
            :class="{ 'voice-row--selected': appStore.ttsConfig.elevenlabsVoiceId === voice.voice_id }"
            @click="selectVoice(voice.voice_id)"
          >
            <div class="voice-row__avatar" :style="{ background: avatarGradient(voice.name) }">
              {{ voice.name.slice(0, 1).toUpperCase() }}
            </div>
            <div class="voice-row__content">
              <div class="voice-row__title">{{ voice.name }}</div>
              <div class="voice-row__subtitle">{{ voiceSubtitle(voice) }}</div>
            </div>
            <div class="voice-row__actions">
              <v-btn
                v-if="voice.preview_url"
                icon="mdi-play"
                size="small"
                variant="text"
                @click.stop="playPreview(voice.preview_url)"
              ></v-btn>
              <v-icon
                :icon="appStore.ttsConfig.elevenlabsVoiceId === voice.voice_id ? 'mdi-check-circle' : 'mdi-dots-horizontal'"
                :color="appStore.ttsConfig.elevenlabsVoiceId === voice.voice_id ? 'primary' : undefined"
                size="20"
              ></v-icon>
            </div>
          </button>
          <div v-if="!filteredVoices.length && !voicesLoading" class="voice-dialog__empty">
            {{ t('common.states.noData') }}
          </div>
          <div v-if="voicesLoading" class="voice-dialog__loading-more">
            {{ t('features.tts.config.loadingMoreVoices') }}
          </div>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useAppStore } from '@/store'

const appStore = useAppStore()
const { t } = useTranslation()

const ALL_LANGUAGE_OPTIONS = [
  ['zh', '中文'],
  ['en', '英语'],
  ['fil', '菲律宾语'],
  ['de', '德语'],
  ['ja', '日语'],
  ['ko', '韩语'],
  ['ms', '马来语'],
  ['th', '泰语'],
  ['vi', '越南语'],
] as const

const voiceDialogOpen = ref(false)
const searchQuery = ref('')
const selectedGender = ref('')
const selectedCategory = ref('')
const selectedAge = ref('')
const selectedLanguage = ref('')
const visibleCount = ref(20)
const voicesLoading = ref(false)

const speedItems = computed(() => [
  { label: t('features.tts.config.speedSlow'), value: 0.8 },
  { label: t('features.tts.config.speedMedium'), value: 1 },
  { label: t('features.tts.config.speedFast'), value: 1.2 },
])

const normalizeText = (value: unknown) => String(value || '').toLowerCase()

const selectedVoice = computed(() =>
  appStore.elevenlabsVoicesList.find((voice: any) => voice.voice_id === appStore.ttsConfig.elevenlabsVoiceId),
)

const voiceSubtitle = (voice: any) =>
  voice.description || voice.labels?.description || t('features.tts.config.voiceDescriptionFallback')

const genderOptions = [
  { title: '女 (Female)', value: 'female' },
  { title: '男 (Male)', value: 'male' },
]

const categoryOptions = [
  { title: '专业 (Professional)', value: 'professional' },
  { title: '高品质 (High Quality)', value: 'high_quality' },
  { title: '知名 (Famous)', value: 'famous' },
]

const ageOptions = [
  { title: '老年 (Senior)', value: 'senior' },
  { title: '年轻 (Young)', value: 'young' },
  { title: '儿童 (Child)', value: 'child' },
]

const languageOptions = ALL_LANGUAGE_OPTIONS.map(([value, label]) => ({
  title: label,
  value,
}))

const activeChipLabels = computed(() => {
  const labels: string[] = []
  if (selectedGender.value) {
    const opt = genderOptions.find((o) => o.value === selectedGender.value)
    if (opt) labels.push(`性别 | ${opt.title}`)
  }
  if (selectedCategory.value) {
    const opt = categoryOptions.find((o) => o.value === selectedCategory.value)
    if (opt) labels.push(`类别 | ${opt.title}`)
  }
  if (selectedAge.value) {
    const opt = ageOptions.find((o) => o.value === selectedAge.value)
    if (opt) labels.push(`年龄 | ${opt.title}`)
  }
  if (selectedLanguage.value) {
    const opt = languageOptions.find((o) => o.value === selectedLanguage.value)
    if (opt) labels.push(`语言 | ${opt.title}`)
  }
  return labels
})

const removeChip = (label: string) => {
  if (label.startsWith('性别 |')) selectedGender.value = ''
  if (label.startsWith('类别 |')) selectedCategory.value = ''
  if (label.startsWith('年龄 |')) selectedAge.value = ''
  if (label.startsWith('语言 |')) selectedLanguage.value = ''
  onFilterChange()
}

const onFilterChange = () => {
  loadVoices(true)
}

const filteredVoices = computed(() => {
  const query = normalizeText(searchQuery.value)
  if (!query) return appStore.elevenlabsVoicesList
  return appStore.elevenlabsVoicesList.filter((voice: any) => {
    const haystack = [
      voice.name,
      voice.description,
      voice.labels?.language,
      voice.labels?.accent,
      voice.labels?.gender,
      voice.category,
    ]
      .filter(Boolean)
      .map(normalizeText)
      .join(' ')
    return haystack.includes(query)
  })
})

const visibleVoices = computed(() => filteredVoices.value.slice(0, visibleCount.value))

const loadVoices = async (reset: boolean = false) => {
  if (!appStore.ttsConfig.elevenlabsApiKey) return

  voicesLoading.value = true
  if (reset) {
    appStore.elevenlabsVoicesList = []
    visibleCount.value = 20
  }

  try {
    await window.electron.elevenlabsTtsSetApiKey({ apiKey: appStore.ttsConfig.elevenlabsApiKey })

    const result = await window.electron.elevenlabsTtsGetVoiceList({
      pageSize: 100,
      gender: selectedGender.value || undefined,
      category: selectedCategory.value || undefined,
      age: selectedAge.value || undefined,
      language: selectedLanguage.value || undefined,
      search: searchQuery.value || undefined,
    })
    appStore.elevenlabsVoicesList = result.voices
  } catch (error: any) {
    console.error('加载ElevenLabs语音列表失败', error)
  } finally {
    voicesLoading.value = false
  }
}

const handleListScroll = (event: Event) => {
  const target = event.target as HTMLElement
  const nearBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 120
  if (nearBottom) {
    visibleCount.value = Math.min(visibleCount.value + 20, filteredVoices.value.length)
  }
}

const selectVoice = (voiceId: string) => {
  appStore.ttsConfig.elevenlabsVoiceId = voiceId
  voiceDialogOpen.value = false
}

const avatarGradient = (seed: string) => {
  const gradients = [
    'linear-gradient(135deg, #7ce0c3, #2eb67d)',
    'linear-gradient(135deg, #8fb8ff, #4c6fff)',
    'linear-gradient(135deg, #f8b4d9, #d946ef)',
    'linear-gradient(135deg, #ffd680, #f97316)',
    'linear-gradient(135deg, #c7b5ff, #7c3aed)',
  ]
  const index = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % gradients.length
  return gradients[index]
}

let previewAudio: HTMLAudioElement | null = null
const playPreview = (url: string) => {
  if (previewAudio) {
    previewAudio.pause()
    previewAudio.currentTime = 0
  }
  previewAudio = new Audio(url)
  previewAudio.play()
}

watch([searchQuery], () => {
  visibleCount.value = 20
})

watch(voiceDialogOpen, async (open) => {
  if (open) {
    if (appStore.elevenlabsVoicesList.length === 0) {
      await loadVoices(true)
    } else {
      visibleCount.value = 20
    }
  }
})
</script>

<style lang="scss" scoped>
.tts-elevenlabs {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tts-elevenlabs__summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tts-elevenlabs__label {
  font-size: 12px;
  color: var(--workbench-text-soft);
}

.tts-elevenlabs__picker {
  border: 1px solid rgba(96, 72, 41, 0.12);
  background: rgba(255, 255, 255, 0.76);
  border-radius: 14px;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  text-align: left;
}

.tts-elevenlabs__picker-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--workbench-text);
}

.tts-elevenlabs__picker-subtitle {
  font-size: 12px;
  color: var(--workbench-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voice-dialog {
  padding: 16px;
  border-radius: 22px;
}

.voice-dialog__header,
.voice-dialog__toolbar,
.voice-dialog__filters,
.voice-row,
.voice-row__actions {
  display: flex;
  align-items: center;
}

.voice-dialog__header {
  justify-content: space-between;
  margin-bottom: 10px;
}

.voice-dialog__title {
  font-size: 22px;
  font-weight: 800;
}

.voice-dialog__toolbar {
  margin-bottom: 10px;
}

.voice-dialog__search {
  flex: 1;
}

.voice-dialog__filters {
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.voice-dialog__filter-select {
  width: 130px;
}

.voice-dialog__filter-select--language {
  width: 120px;
}

.voice-dialog__active-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.voice-dialog__list {
  max-height: 62vh;
  overflow-y: auto;
}

.voice-row {
  width: 100%;
  gap: 12px;
  padding: 12px 10px;
  border-radius: 18px;
  text-align: left;
}

.voice-row:hover,
.voice-row--selected {
  background: rgba(64, 52, 45, 0.06);
}

.voice-row__avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  flex: 0 0 auto;
}

.voice-row__content {
  min-width: 0;
  flex: 1;
}

.voice-row__title {
  font-size: 16px;
  font-weight: 800;
  color: var(--workbench-text);
}

.voice-row__subtitle {
  font-size: 12px;
  color: var(--workbench-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.voice-row__actions {
  gap: 8px;
}

.voice-dialog__empty {
  padding: 20px 0;
  color: var(--workbench-text-soft);
  text-align: center;
}

.voice-dialog__loading-more {
  padding: 12px 0 4px;
  text-align: center;
  color: var(--workbench-text-soft);
  font-size: 12px;
}
</style>
