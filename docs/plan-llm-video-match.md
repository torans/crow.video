# LLM 视频片段智能匹配方案

## 目标
用 DeepSeek LLM 替代现有评分算法，实现 TTS 文案与视频片段的精确语义对齐。

## 背景
- 现有算法（颜色覆盖率 + tag 匹配 + 语义权重）无法理解深层语义，常出现"介绍 A 功能时播放 B 画面"
- LLM 理解语义能力强，能判断"这句话在说什么"和"这个画面在演什么"之间的匹配关系

## 方案 A：按需分析 + LLM 精选

### 流程

```
1. 用户触发渲染
2. TTS 生成音频 + ASS 字幕
3. 解析 ASS 获取每个句子的时间范围 + 文案
4. 根据目标总时长和句子数量，预估需要多少片段（例：60s 总时长 / 3s 平均 = 约20个片段）
5. 根据文案语义，从素材库中粗筛 top 30~50 候选片段（按 tags 相关性过滤，保留最相关的 30~50 个）
6. 将这 30~50 个候选片段的分析数据 + 字幕文案一次性发给 DeepSeek LLM
7. LLM 返回：每个时间段 → 对应哪个视频片段（JSON 数组）
8. 组装 videoFiles + timeRanges
9. FFmpeg 渲染
```

### 传给 LLM 的数据

**系统提示词**：
```
你是一个专业的短视频素材匹配专家。请根据给定的文案和素材库，为每个句子选择最匹配的视频片段。

规则：
1. 每个片段可以用多次，也可以不用
2. 选择时综合考虑：语义相关性、场景一致性、情感调性
3. 返回 JSON 数组，顺序对应文案的播放顺序

输出格式：
[
  { "segmentIndex": 2, "start": 0.0, "end": 3.5 },
  { "segmentIndex": 0, "start": 3.5, "end": 7.2 }
]
```

**用户消息**：
```
文案（共 N 句）：
[0.0s-3.5s] 第一句文案内容
[3.5s-7.2s] 第二句文案内容
...

素材库候选片段（M 个）：
{index}: "描述文字", tags: [tag1, tag2], 时长: Xs, 颜色: [color1]
{index}: ...
```

### 技术实现

#### 新增 IPC 调用
```
vlMatchByLLM(params: {
  sentences: Array<{ text: string; start: number; end: number }>
  videoAssets: string[]  // 素材路径列表
  productInfo?: { name, features, highlights, targetAudience }
}): Promise<{
  videoFiles: string[]
  timeRanges: [string, string][]
}>
```

#### 实现步骤

**Step 1**: 新增 `electron/vl/llm-match.ts`
- `parseAssSentences(assFilePath)` → 解析 ASS 文件，返回 `Array<{text, start, end}>`
- `fetchTopKCandidates(sentences, videoAssets, k)` → 根据语义粗筛 top K 候选
- `callLLMMatch(sentences, candidates)` → 一次性发 DeepSeek，返回分配结果
- `assembleSegments(llmResult)` → 组装 `videoFiles + timeRanges`

**Step 2**: 更新 `electron/ipc.ts`
- 注册 `vl-match-by-llm` handler

**Step 3**: 更新 `src/views/Home/index.vue`
- 读取"音视频同步"开关状态
- 选 yes → 调用 `vlMatchByLLM`
- 选 no → 走现有 `vlMatchVideoSegments`

**Step 4**: 更新 UI
- 在"批量生成"旁加 `v-switch` "音视频同步"
- 状态存储在 `appStore.renderConfig` 里

#### 依赖
- DeepSeek API（复用现有的 `appStore.llmConfig`）
- 现有素材库分析数据（SQLite 中已存储的 description/tags/colors）

### 风险点
- DeepSeek API 调用失败：需要 fallback 到现有算法
- 候选片段数量过多（100+）：粗筛 k 值动态调整
- ASS 解析失败：fallback 到现有算法

### 暂不实现（后续迭代）
- 方案 B：向量索引 + 按需检索（素材库很大时）
- 片段重复使用控制（目前允许重复）
