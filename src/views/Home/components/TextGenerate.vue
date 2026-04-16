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

/**
 * 核心升级：动态参数对齐系统
 */
const buildSystemPrompt = (productContext?: string): string => {
  const lang = appStore.llmConfig.language || '中文'
  const product = appStore.currentProduct
  const isSceneMode = appStore.renderConfig.matchMode === 'scene'

  const parts: string[] = []
  parts.push(`你是一个专业短视频口播文案导演。`)
  parts.push(`【核心任务】生成一段适配产品素材库的口播文案，文案结构必须严格遵守：Hook（黄金3秒） -> Content（产品价值） -> Scene（使用场景/情境代入） -> CTA（产品展示+转化引导）。`)
  parts.push(`【全局原则】：
1. 全文只输出一段自然口播，不要标题、编号、括号说明、标签或 markdown。
2. 严禁负面抱怨、翻车、问题对比、售后类表达；素材库以正向展示为主，声画必须统一。
3. 语言要口语化、像真人在镜头前直接说，但不能空泛。
4. 每一段都要能被画面承接：Hook 对应动态抓眼镜头，Content 对应参数/细节特写，Scene 对应真实使用场景，CTA 对应成果展示或产品展示。
5. 不要反复套用同一开场模板，尽量变换句式、节奏和切入角度。`)

  if (productContext) {
    parts.push(`\n【外部产品上下文】：`)
    parts.push(productContext)
  }

  if (product) {
    parts.push(`\n【当前产品动态数据】：`)
    parts.push(`- 名称：${product.name}`)
    if (product.features) parts.push(`- 工艺卖点（对应特写镜头）：${product.features}`)
    if (product.highlights) parts.push(`- 性能亮点（对应展示镜头）：${product.highlights}`)
    if (product.target_audience) parts.push(`- 目标人群：${product.target_audience}`)

    if (isSceneMode) {
      parts.push(`\n【场景模式结构要求】：
- Hook：开头一句必须直接抓人，优先从动作感、结果感、上手感切入，不能空喊口号。
- Content：必须有 3 句连续内容，明确说出产品卖点、参数、细节或使用价值，至少落到 3 个具体点。
- Scene：必须有 1 句独立的“使用场景/情境代入”，让人能脑补在户外、水边、作钓或上手使用的状态；不要写故障对比。
- CTA：最后 1 句必须是明确收束和转化，允许自然，不要太硬广，但必须带动作导向，比如“备一卷、安排上、带上它、去试试”。`)
    } else {
      parts.push(`\n【产品模式结构要求】：
- Hook：开头先给一个抓眼的性能感受或直观结果。
- Content：主体必须有 3 句连续内容，重点讲产品细节、参数、质感、性能价值。
- Scene：用一句简短口播带出真实使用情境，让画面不只剩静态参数。
- CTA：最后一句必须是明确收束和轻转化表达，不能只是继续夸产品。`)
    }
  }

  parts.push(`\n【输出要求】：
- 语言：${lang}
- 字数：120-170字左右
- 固定输出 6 句：
  第1句 Hook
  第2-4句 Content
  第5句 Scene
  第6句 CTA
- Content 三句的总字数必须占全文 55% 以上。
- Hook 尽量短促有力；Content 信息最饱满；Scene 要有代入感；CTA 要有收束感。
- 必须直接复用产品信息中的关键词和卖点词，方便剪辑系统做语义匹配。
- 不要输出“第一、第二、最后”这类显式分段词。
- 第5句必须出现能体现使用情境的词，如“岸边、户外、水边、作钓、实战、上手、出门”中的至少一个。
- 第6句必须出现转化或行动导向词，如“备一卷、安排、带上、试试、入手、上链接”中的至少一个。
- 直接输出最终口播文案。`)

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

    for await (const textPart of result.textStream) {
      outputText.value += textPart
    }
    return outputText.value
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
