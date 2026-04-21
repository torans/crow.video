import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  buildRenderVideoArgs,
  DEFAULT_OUTPUT_FPS,
  getTotalSegmentDuration,
} from './render-args.ts'

test('buildRenderVideoArgs normalizes each clip to CFR before concat', () => {
  const { args, outputPath } = buildRenderVideoArgs({
    videoFiles: ['/tmp/a.mp4', '/tmp/b.mp4'],
    timeRanges: [['6', '6.9'], ['0', '1.57']],
    audioFiles: { voice: '/tmp/voice.mp3', bgm: '/tmp/bgm.mp3' },
    subtitleFile: '/tmp/subs.srt',
    outputSize: { width: 1080, height: 1920 },
    outputPath: '/tmp/out.mp4',
    outputDuration: '2.47',
    resolvedVoicePath: '/tmp/voice.mp3',
    resolvedSubtitlePath: '/tmp/subs.srt',
  })

  const filterIndex = args.indexOf('-filter_complex')
  assert.notEqual(filterIndex, -1)
  const filter = args[filterIndex + 1]

  assert.equal(outputPath, '/tmp/out.mp4')
  assert.match(filter, new RegExp(`\\[0:v\\]trim=start=6:end=6\\.9,setpts=PTS-STARTPTS,settb=AVTB,fps=${DEFAULT_OUTPUT_FPS}`))
  assert.match(filter, new RegExp(`\\[1:v\\]trim=start=0:end=1\\.57,setpts=PTS-STARTPTS,settb=AVTB,fps=${DEFAULT_OUTPUT_FPS}`))
  assert.match(filter, /format=yuv420p\[vout\]/)
  assert.ok(!args.includes('vfr'))
  assert.ok(args.includes('-r'))
  assert.ok(args.includes(String(DEFAULT_OUTPUT_FPS)))
})

test('getTotalSegmentDuration sums valid time ranges only', () => {
  assert.equal(
    getTotalSegmentDuration([
      ['6', '7.92'],
      ['0', '1.36'],
      ['4', '4'],
      ['bad', '5'],
    ]),
    3.2800000000000002,
  )
})

test('buildRenderVideoArgs normalizes Windows subtitle paths for ffmpeg filters', () => {
  const windowsSubtitlePath = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\crow-video\\temp-tts-voice-1776748899323.ass'
  const originalExistsSync = fs.existsSync

  fs.existsSync = ((path: fs.PathLike) => path === windowsSubtitlePath) as typeof fs.existsSync

  try {
    const { args } = buildRenderVideoArgs({
      videoFiles: ['D:/assets/a.mp4'],
      timeRanges: [['0', '1']],
      audioFiles: { voice: 'C:/temp/voice.mp3' },
      subtitleFile: windowsSubtitlePath,
      outputSize: { width: 1080, height: 1920 },
      outputPath: 'C:/temp/out.mp4',
      outputDuration: '1',
      resolvedVoicePath: 'C:/temp/voice.mp3',
      resolvedSubtitlePath: windowsSubtitlePath,
    })

    const filter = args[args.indexOf('-filter_complex') + 1]

    assert.match(
      filter,
      /\[vout\]subtitles='C\\:\/Users\/Administrator\/AppData\/Local\/Temp\/crow-video\/temp-tts-voice-1776748899323\.ass'\[with_subs\]/,
    )
  } finally {
    fs.existsSync = originalExistsSync
  }
})
