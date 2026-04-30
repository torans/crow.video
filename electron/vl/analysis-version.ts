export const FRAME_ANALYSIS_PROMPT_VERSION = 3

export interface ExistingVideoAnalysisVersionRow {
  count: number
  analyzed_prompt_version?: number | null
}

export function shouldRefreshVideoAnalysis(
  rows: ExistingVideoAnalysisVersionRow[],
  currentVersion: number = FRAME_ANALYSIS_PROMPT_VERSION,
): boolean {
  const existing = rows[0]
  if (!existing || Number(existing.count) <= 0) return true

  const version = Number(existing.analyzed_prompt_version || 0)
  return version < currentVersion
}
