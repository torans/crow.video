export interface VideoSegmentAssetRef {
  path: string
  name: string
}

export interface VideoSegmentAsset {
  path: string
  name: string
  duration: number
}

export interface VideoSegmentPickerParams {
  duration: number
  assets: VideoSegmentAssetRef[]
  getDuration: (asset: VideoSegmentAssetRef) => Promise<number>
  randomChoice: <T>(items: T[]) => T | undefined
  randomFloat: (min: number, max: number) => number
  minSegmentDuration?: number
  maxSegmentDuration?: number
}

export interface VideoSegmentPickerResult {
  videoFiles: string[]
  timeRanges: [string, string][]
}

const trunc3 = (n: number) => ((n * 1e3) << 0) / 1e3

function createIndexPool(length: number, excluded: Set<number>): number[] {
  const pool: number[] = []
  for (let index = 0; index < length; index += 1) {
    if (!excluded.has(index)) {
      pool.push(index)
    }
  }
  return pool
}

export async function pickVideoSegments(
  params: VideoSegmentPickerParams,
): Promise<VideoSegmentPickerResult> {
  const minSegmentDuration = params.minSegmentDuration ?? 2
  const maxSegmentDuration = params.maxSegmentDuration ?? 15

  if (params.duration <= 0) {
    throw new Error('Target duration must be greater than 0')
  }

  if (!params.assets.length) {
    throw new Error('No video assets available')
  }

  const segments: VideoSegmentPickerResult = {
    videoFiles: [],
    timeRanges: [],
  }

  let currentTotalDuration = 0
  const excludedAssetIndices = new Set<number>()
  let remainingAssetIndices = createIndexPool(params.assets.length, excludedAssetIndices)
  let consecutiveSelectionFailures = 0
  const maxConsecutiveSelectionFailures = Math.max(params.assets.length * 2, 12)

  while (currentTotalDuration < params.duration) {
    if (consecutiveSelectionFailures > maxConsecutiveSelectionFailures) {
      throw new Error('Unable to assemble enough video segments from valid assets')
    }

    if (remainingAssetIndices.length === 0) {
      remainingAssetIndices = createIndexPool(params.assets.length, excludedAssetIndices)
      if (remainingAssetIndices.length === 0) {
        throw new Error('Unable to assemble enough video segments from valid assets')
      }
      continue
    }

    const randomAssetIndex = params.randomChoice(remainingAssetIndices)
    if (typeof randomAssetIndex !== 'number') {
      consecutiveSelectionFailures += 1
      continue
    }

    const remainingIndex = remainingAssetIndices.indexOf(randomAssetIndex)
    if (remainingIndex < 0) {
      consecutiveSelectionFailures += 1
      continue
    }

    remainingAssetIndices.splice(remainingIndex, 1)
    const randomAsset = params.assets[randomAssetIndex]

    let randomAssetDuration = 0
    try {
      randomAssetDuration = await params.getDuration(randomAsset)
    } catch {
      excludedAssetIndices.add(randomAssetIndex)
      consecutiveSelectionFailures += 1
      continue
    }

    if (!Number.isFinite(randomAssetDuration) || randomAssetDuration <= 0) {
      excludedAssetIndices.add(randomAssetIndex)
      consecutiveSelectionFailures += 1
      continue
    }

    if (randomAssetDuration < minSegmentDuration) {
      segments.videoFiles.push(randomAsset.path)
      segments.timeRanges.push([String(0), String(trunc3(randomAssetDuration))])
      currentTotalDuration = trunc3(currentTotalDuration + randomAssetDuration)
      consecutiveSelectionFailures = 0
      continue
    }

    let randomSegmentDuration = params.randomFloat(
      minSegmentDuration,
      Math.min(maxSegmentDuration, randomAssetDuration),
    )

    if (currentTotalDuration + randomSegmentDuration > params.duration) {
      randomSegmentDuration = params.duration - currentTotalDuration
    }

    if (params.duration - currentTotalDuration - randomSegmentDuration < minSegmentDuration) {
      if (params.duration - currentTotalDuration < randomAssetDuration) {
        randomSegmentDuration = params.duration - currentTotalDuration
      }
    }

    if (!Number.isFinite(randomSegmentDuration) || randomSegmentDuration <= 0) {
      consecutiveSelectionFailures += 1
      continue
    }

    const startMax = Math.max(0, randomAssetDuration - randomSegmentDuration)
    const randomSegmentStart = startMax > 0 ? params.randomFloat(0, startMax) : 0

    segments.videoFiles.push(randomAsset.path)
    segments.timeRanges.push([
      String(trunc3(randomSegmentStart)),
      String(trunc3(randomSegmentStart + randomSegmentDuration)),
    ])
    currentTotalDuration = trunc3(currentTotalDuration + randomSegmentDuration)
    consecutiveSelectionFailures = 0
  }

  return segments
}
