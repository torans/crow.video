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
                { label: '产品特写', value: 'product' },
                { label: '爆款场景', value: 'scene' },
              ]"
              item-title="label"
              item-value="value"
              density="compact"
              hide-details
              variant="outlined"
              style="min-width: 100px"
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
                  <v-select
                    :label="t('features.llm.config.language')"
                    v-model="config.language"
                    :items="languageOptions"
                    item-title="label"
                    item-value="value"
                  ></v-select>
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
  { label: 'English', value: 'English' },
  { label: '日本語', value: '日本語' },
  { label: '한국어', value: '한국어' },
  { label: 'Español', value: 'Español' },
  { label: 'Français', value: 'Français' },
  { label: 'Deutsch', value: 'Deutsch' },
  { label: 'Português', value: 'Português' },
  { label: 'ภาษาไทย', value: 'ภาษาไทย' },
  { label: 'Tiếng Việt', value: 'Tiếng Việt' },
]

const buildSystemPrompt = (productContext?: string): string => {
  if (productContext) return productContext
  const lang = appStore.llmConfig.language || '中文'
  const product = appStore.currentProduct

  const parts: string[] = []
  parts.push(`你是一个专业短视频口播文案导演，只生成口播文案，不解释，不补充。`)

  if (product) {
    parts.push(`【当前产品】：${product.name}`)
    if (product.features) parts.push(`【核心卖点】：${product.features}`)
    if (product.highlights) parts.push(`【性能亮点】：${product.highlights}`)
    if (product.target_audience) parts.push(`【目标人群】：${product.target_audience}`)
  }

  parts.push(`【文案结构强制要求】：
- Hook：一句话否定旧认知、抛出悬念或直接给结果，让刷到的人停下来。不要喊口号，不要"你知道吗"问句，更不要感叹号结尾。参考风格："不是你抛不远，而是你用错了线"。
- Content：只引用产品数据里已有的卖点、参数、细节来写。禁止凭空捏造任何数字、规格、认证、证书等不在素材里的信息。
- CTA：收尾在产品或成果上，轻微紧迫感即可，不要喊"赶紧下单"。参考风格："现在活动优惠多多，赶紧带回家吧"。
- 全程口语化，像跟朋友聊天一样说，不是念说明书。

【输出要求】：
- 语言：${lang}
- 总字数：80-120字
- 禁止 markdown，禁止 **粗体**，禁止 # 标题，禁止 - 列表，禁止 > 引用，禁止任何符号标记
- 只能输出纯中文句子，每句以句号结尾，不要用感叹号
- 不要"首先、其次、最后、另外"等过渡词
- 不要写使用场景铺垫（不要"当你xxx的时候"）
- 不要给文案加标题、加标签、加引言、加总结段`)

  return parts.join('\n')
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
    outputText.value = rawText
    return rawText
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
