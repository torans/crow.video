import fs from 'node:fs'
import type { RenderVideoParams } from './types.ts'

export const DEFAULT_OUTPUT_FPS = 30

export function getTotalSegmentDuration(timeRanges: [string, string][]): number {
  return timeRanges.reduce((sum, [start, end]) => {
    const s = Number.parseFloat(start)
    const e = Number.parseFloat(end)
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return sum
    return sum + (e - s)
  }, 0)
}

export function buildRenderVideoArgs(
  params: RenderVideoParams & {
    resolvedVoicePath: string
    resolvedSubtitlePath: string
  },
): { args: string[]; hasSubtitle: boolean; outputPath: string } {
  const {
    videoFiles,
    timeRanges,
    outputSize,
    outputDuration,
    audioFiles,
    resolvedVoicePath,
    resolvedSubtitlePath,
  } = params

  const outputPath = params.outputPath
  const args: string[] = []

  videoFiles.forEach((file) => {
    args.push('-ignore_editlist', '1', '-i', `${file}`)
  })

  args.push('-i', `${resolvedVoicePath}`)

  if (audioFiles?.bgm) {
    args.push('-i', `${audioFiles.bgm}`)
  }

  const filters: string[] = []
  const videoStreams: string[] = []

  videoFiles.forEach((_, index) => {
    const [start, end] = timeRanges[index]
    const streamLabel = `v${index}`
    videoStreams.push(streamLabel)

    filters.push(
      `[${index}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,settb=AVTB,fps=${DEFAULT_OUTPUT_FPS},scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=decrease,pad=${outputSize.width}:${outputSize.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setsar=1[${streamLabel}]`,
    )
  })

  filters.push(`[${videoStreams.join('][')}]concat=n=${videoFiles.length}:v=1:a=0[vconcat]`)
  filters.push(`[vconcat]format=yuv420p[vout]`)

  const hasSubtitle = fs.existsSync(resolvedSubtitlePath)
  if (hasSubtitle) {
    filters.push(`[vout]subtitles=${resolvedSubtitlePath.replace(/\:/g, '\\\\:')}[with_subs]`)
  }

  const voiceStreamIdx = videoFiles.length
  const bgmStreamIdx = audioFiles?.bgm ? videoFiles.length + 1 : null

  if (outputDuration) {
    filters.push(`[${voiceStreamIdx}:a]loudnorm=I=-16:TP=-1.5:LRA=11[voice_norm_raw]`)
    filters.push(
      `[voice_norm_raw]atrim=0:${outputDuration},asetpts=PTS-STARTPTS[voice_normalized]`,
    )

    if (bgmStreamIdx !== null) {
      filters.push(`[${bgmStreamIdx}:a]loudnorm=I=-25:TP=-1.5:LRA=11[bgm_norm_raw]`)
      filters.push(`[bgm_norm_raw]atrim=0:${outputDuration},asetpts=PTS-STARTPTS[bgm_trimmed]`)
      filters.push(
        `[voice_normalized][bgm_trimmed]amix=inputs=2:duration=first:dropout_transition=0[final_audio]`,
      )
    } else {
      filters.push(`[voice_normalized]acopy[final_audio]`)
    }
  } else {
    filters.push(`[${voiceStreamIdx}:a]loudnorm=I=-16:TP=-1.5:LRA=11[voice_normalized]`)

    if (bgmStreamIdx !== null) {
      filters.push(`[${bgmStreamIdx}:a]loudnorm=I=-25:TP=-1.5:LRA=11[bgm_normalized]`)
      filters.push(
        `[voice_normalized][bgm_normalized]amix=inputs=2:duration=first:dropout_transition=0[final_audio]`,
      )
    } else {
      filters.push(`[voice_normalized]acopy[final_audio]`)
    }
  }

  args.push('-filter_complex', `${filters.join(';')}`)

  const videoOut = hasSubtitle ? '[with_subs]' : '[vout]'
  args.push('-map', videoOut, '-map', '[final_audio]')

  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-r',
    String(DEFAULT_OUTPUT_FPS),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-s',
    `${outputSize.width}x${outputSize.height}`,
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    ...(outputDuration ? ['-t', outputDuration] : []),
    '-stats',
    outputPath,
  )

  return { args, hasSubtitle, outputPath }
}
