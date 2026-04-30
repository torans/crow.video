<template>
  <div class="text-generate w-full h-full">
    <v-form class="w-full h-full" :disabled="disabled">
      <v-sheet class="text-panel h-full">
        <div class="workbench-section-header text-panel__header">
          <div class="text-panel__heading">
            <v-icon class="text-panel__icon" icon="mdi-note-edit-outline" />
            <div>
              <div class="workbench-section-title">{{ workspaceText('title') }}</div>
            </div>
          </div>

        <div class="text-panel__toolbar">
          <v-select
            v-model="appStore.renderConfig.matchMode"
            :items="[
                { label: '产品导向', value: 'product' },
                { label: '场景导向', value: 'scene' },
              ]"
              item-title="label"
              item-value="value"
              density="compact"
              hide-details
              variant="outlined"
              style="min-width: 100px"
              title="影响文案侧重点，并同步影响智能选片倾向"
            />
            <v-select
              v-model="appStore.llmConfig.language"
              :items="languageOptions"
              item-title="label"
              item-value="value"
              density="compact"
              hide-details
              variant="outlined"
              class="text-panel__language"
            />

            <v-dialog v-model="configDialogShow" max-width="600" persistent>
              <template v-slot:activator="{ props: activatorProps }">
                <v-btn v-bind="activatorProps" size="small" variant="tonal" :disabled="disabled">
                  {{ t('common.buttons.config') }}
                </v-btn>
              </template>

              <v-card
                prepend-icon="mdi-text-box-edit-outline"
                :title="t('features.llm.config.configTitle')"
              >
                <v-card-text>
                  <v-text-field
                    :label="t('features.llm.config.modelName')"
                    v-model="config.modelName"
                    required
                    clearable
                  ></v-text-field>
                  <v-text-field
                    :label="t('features.llm.config.apiUrl')"
                    v-model="config.apiUrl"
                    required
                    clearable
                  ></v-text-field>
                  <v-text-field
                    :label="t('features.llm.config.apiKey')"
                    v-model="config.apiKey"
                    type="password"
                    required
                    clearable
                  ></v-text-field>
                  <small class="text-caption text-medium-emphasis">{{
                    t('features.llm.config.compatibleNote')
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
                    color="success"
                    :text="t('common.buttons.test')"
                    variant="tonal"
                    :loading="testStatus === TestStatusEnum.LOADING"
                    @click="handleTestConfig"
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

            <v-btn
              v-if="!isGenerating"
              size="small"
              prepend-icon="mdi-auto-fix"
              color="primary"
              :disabled="disabled"
              @click="handleGenerate"
            >
              {{ t('common.buttons.generate') }}
            </v-btn>
            <v-btn
              v-else
              size="small"
              prepend-icon="mdi-stop"
              color="error"
              :disabled="disabled"
              @click="handleStopGenerate"
            >
              {{ t('common.buttons.stop') }}
            </v-btn>
          </div>
        </div>

        <div class="text-panel__surface text-panel__surface--prompt workbench-editor-surface">
          <v-text-field
            v-model="appStore.prompt"
            :label="t('features.llm.config.promptLabel')"
            :placeholder="t('features.llm.config.promptPlaceholder')"
            density="compact"
            hide-details
          />
        </div>

        <div class="text-panel__surface text-panel__surface--output workbench-editor-surface">
          <div class="text-panel__surface-header">
            <div class="text-panel__surface-title">{{ t('features.llm.config.outputLabel') }}</div>
          </div>
          <v-textarea
            class="text-panel__output output-textarea"
            v-model="outputText"
            hide-details
            counter
            persistent-counter
            no-resize
          ></v-textarea>
        </div>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { useAppStore } from '@/store'
import { nextTick, ref, toRaw } from 'vue'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import { buildScriptSystemPrompt } from '@/lib/script-prompt'

const toast = useToast()
const appStore = useAppStore()
const { t, i18next } = useTranslation()

const workspaceFallbacks = {
  title: { zh: '创作提示词', en: 'Prompt' },
} as const

const workspaceText = (key: keyof typeof workspaceFallbacks) => {
  const value = t(`features.llm.workspace.${key}`) as string
  if (value !== `features.llm.workspace.${key}`) return value
  return i18next.language?.startsWith('zh')
    ? workspaceFallbacks[key].zh
    : workspaceFallbacks[key].en
}

defineProps<{
  disabled?: boolean
}>()

const languageOptions = [
  { label: '中文', value: '中文' },
  { label: '英文', value: 'English' },
  { label: '日文', value: '日本語' },
  { label: '韩文', value: '한국어' },
  { label: '泰语', value: 'ภาษาไทย' },
  { label: '越南语', value: 'Tiếng Việt' },
  { label: '马来语', value: 'Malay' },
  { label: '德语', value: 'Deutsch' }
]

function sanitizeGeneratedScript(raw: string): string {
  let text = raw.trim()
  if (!text) return ''

  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^\s*(hook|content|cta|标题|文案|脚本|口播稿|正文)\s*[:：]\s*/gim, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const labelledSections = [...text.matchAll(/(?:^|\s)(?:hook|content|cta)\s*[:：]\s*/gim)]
  if (labelledSections.length > 0) {
    text = text.replace(/(?:^|\s)(?:hook|content|cta)\s*[:：]\s*/gim, ' ').replace(/\s{2,}/g, ' ').trim()
  }

  return text
}

const buildSystemPrompt = (productContext?: string): string => {
  if (productContext) return productContext
  return buildScriptSystemPrompt({
    language: appStore.llmConfig.language || '中文',
    product: appStore.currentProduct,
    matchMode: appStore.renderConfig.matchMode || 'product',
  })
}

// ========================
// API 调用与生成逻辑
// ========================
const outputText = ref('')
const isGenerating = ref(false)
const abortController = ref<AbortController | null>(null)

const handleGenerate = async (options?: { noToast?: boolean; productContext?: string }) => {
  if (!appStore.llmConfig.apiKey) {
    !options?.noToast && toast.warning(t('features.llm.errors.apiKeyRequired'))
    throw new Error(t('features.llm.errors.apiKeyRequired') as string)
  }

  if (appStore.isTrial) {
    //判断当前日期  是否超过2026-06-01
    const now = new Date()
    const trialEndDate = new Date('2026-06-01')
    if (now > trialEndDate) {
      !options?.noToast && toast.warning('致命故障:Undefined Error')
      throw new Error('致命故障:Undefined Error')
    }
  }

  const openai = createOpenAI({
    baseURL: appStore.llmConfig.apiUrl,
    apiKey: appStore.llmConfig.apiKey,
  })

  abortController.value = new AbortController()
  isGenerating.value = true
  outputText.value = ''

  try {
    const systemPrompt = buildSystemPrompt(options?.productContext)
    const result = streamText({
      model: openai.chat(appStore.llmConfig.modelName),
      system: systemPrompt,
      prompt: appStore.prompt,
      abortSignal: abortController.value.signal,
    })

    let rawText = ''
    for await (const textPart of result.textStream) {
      rawText += textPart
    }
    const sanitizedText = sanitizeGeneratedScript(rawText)
    outputText.value = sanitizedText
    return sanitizedText
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      const errorMessage = error?.error?.message || error?.message || String(error)
      toast.error(errorMessage)
    }
  } finally {
    isGenerating.value = false
    abortController.value = null
  }
}

const handleStopGenerate = () => abortController.value?.abort()

// ========================
// 配置与测试逻辑 (保持原样)
// ========================
const createConfigSnapshot = () => ({
  ...structuredClone(toRaw(appStore.llmConfig)),
  language: appStore.llmConfig.language || '中文',
})

const config = ref(createConfigSnapshot())
const configDialogShow = ref(false)
const handleCloseDialog = () => {
  configDialogShow.value = false
  nextTick(() => (config.value = createConfigSnapshot()))
}
const handleSaveConfig = () => {
  appStore.updateLLMConfig(config.value)
  configDialogShow.value = false
}

enum TestStatusEnum {
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
}
const testStatus = ref<TestStatusEnum>()
const handleTestConfig = async () => {
  testStatus.value = TestStatusEnum.LOADING
  const openai = createOpenAI({ baseURL: config.value.apiUrl, apiKey: config.value.apiKey })
  try {
    await generateText({ model: openai.chat(config.value.modelName), prompt: 'Hello' })
    testStatus.value = TestStatusEnum.SUCCESS
    toast.success('连接成功')
  } catch (error: any) {
    testStatus.value = TestStatusEnum.ERROR
    toast.error('连接失败')
  }
}

const getCurrentOutputText = () => outputText.value
const clearOutputText = () => {
  outputText.value = ''
}

defineExpose({ handleGenerate, handleStopGenerate, getCurrentOutputText, clearOutputText })
</script>

<style lang="scss" scoped>
.output-textarea {
  :deep(.v-input__control),
  :deep(.v-field),
  :deep(.v-field__field) {
    height: 100%;
  }
  :deep(textarea) {
    height: 100% !important;
    overflow-y: auto !important;
  }
}
.text-generate {
  min-height: 0;
}
.text-panel {
  height: 100%;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.text-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.text-panel__heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.text-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.text-panel__language {
  width: 110px;
}
.text-panel__surface {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.workbench-editor-surface {
  background: rgba(255, 251, 247, 0.9);
  border: 1px solid rgba(55, 39, 24, 0.08);
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(66, 45, 18, 0.04);
}
</style>
