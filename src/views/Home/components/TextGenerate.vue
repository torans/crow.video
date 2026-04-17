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
  const matchMode = appStore.renderConfig.matchMode || 'product'

  const parts: string[] = []

  // 1. 核心人设与字数对标
  parts.push(`你是一个短视频爆款带货编剧，擅长用最狠、最直接的话术实现高转化。`)
  parts.push(`【硬性要求】：总字数严格控制在 100-150 字之间。不准罗嗦，每句话都要有含金量。`)

  // 2. 严格的黄金三段式结构 (Hook + Content + CTA)
  parts.push(`\n【脚本结构指令】（严格遵守以下三段式结构，其中Content占比最大）：
1. **Hook (黄金3秒)**：第1句。必须一句话封喉。要么抛出惊人事实，要么直接展示产品最硬核的瞬间（如：掰不断、划不破、直接砸）。
2. **Content (产品价值)**：中间大部分（占比需达到70%）。
   - ${matchMode === 'product' ? '重点描述“显性卖点”：材质、手感、细节。要让观众觉得这东西很贵、很值。' : '重点描述“使用反差”：没用之前多痛苦，用了之后多爽。强化场景带入感。'}
   - 多用动词（如：拉、拽、弹、磨），禁止用空洞的形容词。
3. **CTA (转化引导)**：最后1-2句。别废话，直接给行动指令。比如“看左下角”、“库存不多”、“直接带走”。`)

  // 3. 语感模型：反 AI 模板化
  parts.push(`\n【语感准则】：
- 拒绝 AI 腔：禁止出现“想象一下”、“在这个世界”、“探索”、“不仅仅...更是”等废话。
- 【严禁捏造】：绝不能虚构产品参数（如具体的线号、尺寸、重量、材质等），只能基于下方提供的【当前产品数据】进行扩写。如果信息较少，请侧重于使用体验、效果和购买号召。
- 风格应当像一个经验丰富、爽快直接的带货主播，语速明快，直戳痛点。`)

  // 4. 动态数据注入
  if (product) {
    parts.push(`\n【当前产品数据】：`)
    parts.push(`- 名称：${product.name}`)
    if (product.features) parts.push(`- 核心工艺：${product.features}`)
    if (product.highlights) parts.push(`- 使用效果：${product.highlights}`)
    if (product.target_audience) parts.push(`- 核心人群：${product.target_audience}`)
  }
  parts.push(`\n【最高优先级语言指令】：
必须将最终生成的口播文案翻译并完全输出为【${lang}】。不管下方提供的产品信息是什么语言，不管上文的结构指令是什么语言，最后输出的成稿必须 100% 使用纯正地道的【${lang}】！`)
  parts.push(`\n规避极限词。比如极细、最强、第一、顶级等等`)
  // 5. 输出格式
  parts.push(
    `\n【绝对强制的输出格式】：
- 这是一个要直接喂给语音合成（TTS）的口播稿，必须是**完全纯文本**。
- 不做任何结构化拆分！不准分点，不准写开头语，不准写类似“Hook:”、“Content:”或“【PE线】”这样的结构化标签。
- 严禁使用任何 Markdown 符号（如 \`**\`、\`*\`、\`#\`、\`-\`）。
- 严禁使用换行符分成多段，必须是连贯、自然融合的一整段话。
- 再次强调：输出的内容要能直接拿去愉快地朗读，请返回总字数严格保持在 100-150 字以内。`,
  )

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
