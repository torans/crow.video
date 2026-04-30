import test from 'node:test'
import assert from 'node:assert/strict'
import { buildScriptSystemPrompt } from './script-prompt.ts'

test('buildScriptSystemPrompt includes creative shot structure rules', () => {
  const prompt = buildScriptSystemPrompt({
    language: '中文',
    matchMode: 'product',
    product: {
      name: '便携榨汁杯',
      features: '轻便便携，磁吸充电',
      highlights: '出门也能快速榨汁',
      target_audience: '上班族',
    },
  })

  assert.match(prompt, /20-30 秒/)
  assert.match(prompt, /至少 7 个以上镜头/)
  assert.match(prompt, /每个镜头时长不超过 3 秒/)
  assert.match(prompt, /产品展示类镜头/)
  assert.match(prompt, /1\/3/)
  assert.match(prompt, /至少包含 1 个产品细节展示镜头/)
  assert.match(prompt, /场景实战/)
  assert.match(prompt, /下单引导/)
})
