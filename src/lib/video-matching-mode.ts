export function chooseMatchingStrategy(params: {
  llmSyncEnabled: boolean
  smartMatchEnabled: boolean
  hasCurrentProduct: boolean
}): 'llm' | 'smart' | 'random' {
  const { llmSyncEnabled, smartMatchEnabled } = params

  if (llmSyncEnabled) return 'llm'
  if (smartMatchEnabled) return 'smart'
  return 'random'
}
