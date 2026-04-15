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
                { label: '产品模式', value: 'product' },
                { label: '场景模式', value: 'scene' },
              ]"
              item-title="label"
              item-value="value"
              density="compact"
              hide-details
              variant="outlined"
              style="min-width: 76px;"
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
            <!-- <div class="text-panel__counter">{{ outputText.length }}</div> -->
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
import { h, nextTick, ref, toRaw } from 'vue'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText, streamText } from 'ai'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import { formatErrorForCopy } from '@/lib/error-copy'

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

// 构建 system prompt：始终要求生成短视频口播文案
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
  const isSceneMode = appStore.renderConfig.matchMode === 'scene'

  if (product) {
    const parts: string[] = []
    parts.push(`你是一个专业的短视频口播文案撰写人。请严格遵守以下规则：`)
    parts.push(`1. 只输出口播文案正文，不要输出标题、标签、分段、markdown格式`)
    parts.push(`2. 文案必须是口语化的，像真人说话一样自然流畅`)
    parts.push(`3. 字数严格控制在80-150字，适合15-30秒的短视频`)
    parts.push(`4. 必须突出产品卖点，有吸引力和购买欲`)
    parts.push(`5. 必须使用${lang}输出文案`)
    parts.push('')
    parts.push('产品信息：')
    parts.push(`产品名称：${product.name}`)
    if (product.features) parts.push(`核心功能：${product.features}`)
    if (product.highlights) parts.push(`产品亮点：${product.highlights}`)
    if (product.target_audience) parts.push(`目标受众：${product.target_audience}`)
    if (product.description) parts.push(`产品外观：${product.description}`)

    if (isSceneMode) {
      // 场景模式：侧重使用体验、真实感受
      parts.push('')
      parts.push('【文案风格要求】')
      parts.push('重点描述真实使用场景和使用感受，突出"用了之后怎么样"的体验感。')
      parts.push('要有代入感，让观众觉得"这就是我平时的使用场景"。')
      parts.push('可以结合生活中的具体情境，如：运动健身、出门在外、工作通勤、居家日常等。')
    }

    return parts.join('\n')
  }
  return `你是一个专业的短视频口播文案撰写人。请严格遵守以下规则：\n1. 只输出口播文案正文，不要输出标题、标签、分段、markdown格式\n2. 文案必须是口语化的，像真人说话一样自然流畅\n3. 字数严格控制在80-150字，适合15-30秒的短视频\n4. 要有吸引力，开头抓人眼球\n5. 必须使用${lang}输出文案`
}

// 生成文案
const outputText = ref('')
const isGenerating = ref(false)
const abortController = ref<AbortController | null>(null)
const handleGenerate = async (options?: { noToast?: boolean; productContext?: string }) => {
  if (!appStore.prompt) {
    !options?.noToast && toast.warning(t('features.llm.errors.promptRequired'))
    throw new Error(t('features.llm.errors.promptRequired') as string)
  }

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
      onError: (error) => {
        throw error
      },
      abortSignal: abortController.value.signal,
    })
    for await (const textPart of result.textStream) {
      outputText.value += textPart
    }
    return outputText.value
  } catch (error: any) {
    console.log(`error`, error)
    // @ts-ignore
    if (error?.name !== 'AbortError' && error?.error?.name !== 'AbortError') {
      const errorMessage =
        error?.error?.message ||
        error?.message ||
        (typeof error === 'object' ? JSON.stringify(error) : String(error))
      if (!options?.noToast) {
        toast.error({
          component: {
            // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
            render: () =>
              h(ActionToastEmbed, {
                message: t('features.llm.errors.generateFailed'),
                detail: String(errorMessage),
                actionText: t('common.buttons.copyErrorDetail'),
                onActionTirgger: () => {
                  navigator.clipboard.writeText(
                    formatErrorForCopy(
                      t('features.llm.errors.generateFailed'),
                      String(errorMessage),
                    ),
                  )
                  toast.success(t('common.messages.success.copySuccess'))
                },
              }),
          },
        })
      }
      throw error
    }
  } finally {
    abortController.value = null
    isGenerating.value = false
  }
}
const handleStopGenerate = () => {
  if (abortController.value) {
    abortController.value.abort()
  }
}

// 配置大模型接口
const createConfigSnapshot = () => ({
  ...structuredClone(toRaw(appStore.llmConfig)),
  language: appStore.llmConfig.language || '中文',
})

const config = ref(createConfigSnapshot())
const configDialogShow = ref(false)
const resetConfigDialog = () => {
  config.value = createConfigSnapshot()
}
const handleCloseDialog = () => {
  configDialogShow.value = false
  nextTick(resetConfigDialog)
}
const handleSaveConfig = () => {
  appStore.updateLLMConfig(config.value)
  configDialogShow.value = false
}

// 测试大模型连通性
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
    const result = await generateText({
      model: openai.chat(config.value.modelName),
      prompt: 'Hello',
    })
    console.log(`result`, result)
    testStatus.value = TestStatusEnum.SUCCESS
    toast.success(t('features.llm.success.connectionSucceeded'))
  } catch (error: any) {
    console.log(error)
    testStatus.value = TestStatusEnum.ERROR
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('features.llm.errors.connectionFailed'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(t('features.llm.errors.connectionFailed'), String(errorMessage)),
              )
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
  }
}

// 获取当前文案
const getCurrentOutputText = () => {
  return outputText.value
}
// 清空文案
const clearOutputText = () => {
  outputText.value = ''
}

defineExpose({ handleGenerate, handleStopGenerate, getCurrentOutputText, clearOutputText })
</script>

<style lang="scss" scoped>
.output-textarea {
  :deep(.v-input__control) {
    height: 100%;
  }
  :deep(.v-field) {
    height: 100%;
  }
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
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.text-panel__icon {
  color: var(--apple-primary);
}

.text-panel__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.text-panel__language {
  width: 110px;
}

.text-panel__surface {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.text-panel__surface--prompt {
  flex: 0 0 auto;
}

.text-panel__surface--output {
  flex: 1;
}

.text-panel__surface-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.text-panel__surface-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--apple-text-tertiary);
}

.text-panel__prompt {
  // padding: 12px;
  // flex: 0 0 auto;
}

.text-panel__output {
  flex: 1;
  min-height: 0;
}

.text-panel__output :deep(.v-input__control),
.text-panel__output :deep(.v-field),
.text-panel__output :deep(.v-field__field) {
  height: 100%;
}

.workbench-editor-surface {
  background: rgba(255, 251, 247, 0.9);
  border: 1px solid rgba(55, 39, 24, 0.08);
  border-radius: 18px;
  box-shadow: 0 10px 28px rgba(66, 45, 18, 0.04);
}
</style>
