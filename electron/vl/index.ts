import request from '../lib/request'
import type { AnalyzeImageParams, VLAnalysisResult, VLApiConfig } from './types'

const ANALYSIS_SYSTEM_PROMPT = `你是一个视觉分析助手。分析图像并返回结构化 JSON。
你必须只返回一个有效的 JSON 对象，不要 markdown、不要解释、不要额外文字。
JSON 必须包含以下字段：
- "description": 用中文简短描述画面主体（最多100字）
- "colors": 产品主体所有可见颜色的数组，用英文小写（最多4个）。这是关键：你必须提取产品主体的所有不同颜色，不能只提取最主要的。例如，绿色鱼线绕在黑色线轴上 → ["green", "black"]。红色杯子带白色盖子 → ["red", "white"]。白色产品带黑色标签 → ["white", "black"]。排除：装饰图案、刺绣、logo、印刷图形、花卉装饰、纽扣配件、背景、阴影、环境色。
- "tags": 中文物品/场景标签数组（如 ["水杯", "电子产品", "户外"]）
- "appeal": 视觉吸引力评分 1-10（整数）。评分依据：构图质量（特写/细节镜头分数更高）、动态表现（产品在使用中比静态更高）、视觉冲击（色彩对比、光线）、产品突出度（产品清晰展示分数更高）。静态背景+闲置产品 = 2-4，使用中/演示 = 6-8，戏剧性动态特写 = 8-10。`

const PRODUCT_ANALYSIS_PROMPT = `这是一张用于营销的产品图。
只关注产品本身的主要 body/材质。完全忽略所有装饰元素。
提取产品主体/主要材质的颜色（最多4个）。排除：装饰图案、刺绣、花卉装饰、纽扣、拉链、印刷、logo、背景、阴影、环境色。
示例：绿色鱼线绕在黑色线轴上 → ["green", "black"]。红色杯子带白色盖子 → ["red", "white"]。
返回 JSON：description（中文，最多100字）、colors（最多4个英文小写主体颜色）、tags（中文物品标签，最多5个）。`

const FRAME_ANALYSIS_PROMPT = `分析这个视频帧。重点识别主体/产品的本体颜色。
只提取产品/前景物体的主要材质颜色（最多4个）。排除：装饰图案、刺绣、花卉装饰、印刷图形、背景、阴影、环境色。
示例：红色衬衫带白色波点 → body 颜色只是 ["red"]。
返回 JSON：description（中文场景描述，最多100字）、colors（最多4个英文小写主体颜色）、tags（中文物品/场景标签，最多5个）、appeal（1-10整数：画面有多吸引人？动态特写/演示 = 8-10，产品在使用中 = 6-8，静态展示 = 3-5，模糊/空镜头 = 1-2）。`

/**
 * 解析 VL 模型响应文本为结构化 JSON
 */
function parseVLResponse(responseText: string): VLAnalysisResult {
  // 尝试从可能被包装的响应中提取 JSON
  let jsonStr = responseText.trim()

  // 移除 markdown 代码块（如果存在）
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  // 尝试找到 JSON 对象模式
  const objMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (objMatch) {
    jsonStr = objMatch[0]
  }

  try {
    const parsed = JSON.parse(jsonStr)
    const rawAppeal = Number(parsed.appeal)
    const appeal = Number.isFinite(rawAppeal) ? Math.max(1, Math.min(10, Math.round(rawAppeal))) : 5
    return {
      description: String(parsed.description || ''),
      colors: Array.isArray(parsed.colors) ? parsed.colors.map(String) : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      appeal,
    }
  } catch {
    console.warn('VL 响应 JSON 解析失败:', responseText)
    return { description: responseText.slice(0, 200), colors: [], tags: [], appeal: 5 }
  }
}

/**
 * 从用户提供的 API URL 构建 chat completions 端点
 * 处理 URL 已包含 /v1 后缀的情况
 */
function buildEndpoint(apiUrl: string): string {
  const base = apiUrl.replace(/\/+$/, '')
  // 如果 URL 已以 /v1 结尾，直接追加 /chat/completions
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`
  }
  return `${base}/v1/chat/completions`
}

/**
 * 调用 VL 模型分析单张图片
 */
export async function analyzeImage(params: AnalyzeImageParams): Promise<VLAnalysisResult> {
  const { imageBase64, prompt, apiConfig } = params

  const endpoint = buildEndpoint(apiConfig.apiUrl)

  const response = await request.post(
    endpoint,
    {
      model: apiConfig.modelName,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    },
    {
      headers: {
        Authorization: `Bearer ${apiConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    },
  )

  const data = response.json<{
    choices: Array<{ message: { content: string } }>
  }>()

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('VL 模型返回空响应')
  }

  return parseVLResponse(content)
}

/**
 * 测试 VL API 连接
 */
export async function testVLConnection(apiConfig: VLApiConfig): Promise<boolean> {
  try {
    const endpoint = buildEndpoint(apiConfig.apiUrl)

    const response = await request.post(
      endpoint,
      {
        model: apiConfig.modelName,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10,
      },
      {
        headers: {
          Authorization: `Bearer ${apiConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    )

    return response.ok
  } catch {
    return false
  }
}

export { PRODUCT_ANALYSIS_PROMPT, FRAME_ANALYSIS_PROMPT }
