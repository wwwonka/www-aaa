import type { Plugin } from 'vite'
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

interface TheatreKeyframe {
  position: number
  value: number
}

interface TheatreTrackData {
  type: 'BasicKeyframedTrack'
  keyframes: TheatreKeyframe[]
}

/** Mirrors `AnimationLoader.ts`'s parse — u8 trackType(0=FLOAT) + u16 keyframeCount(LE) + 1 byte padding + Float32Array pairs. */
function encodeAnim(track: TheatreTrackData): Buffer {
  const sorted = [...track.keyframes].sort((a, b) => a.position - b.position)
  const header = Buffer.alloc(4)
  header.writeUInt8(0, 0) // TrackType.FLOAT
  header.writeUInt16LE(sorted.length, 1)
  // byte 3: padding, Float32Array needs a byteOffset multiple of 4

  const body = Buffer.alloc(sorted.length * 2 * 4)
  sorted.forEach((k, i) => {
    body.writeFloatLE(k.position, i * 8)
    body.writeFloatLE(k.value,    i * 8 + 4)
  })

  return Buffer.concat([header, body])
}

/**
 * Converts `public/game/animations/*.json` (Theatre.js's native `BasicKeyframedTrack` shape, one
 * file per track — see `src/_dev/assets/JsonAnimationLoader.ts`, its dev-time counterpart) into
 * the compact `.anim` binary `AnimationLoader.ts` reads in production. Runs only at `pnpm build`,
 * after Vite has copied `public/` into the output dir — writes `.anim` there and removes the
 * copied `.json`, so a production bundle never ships (or references) animation JSON. Never touches
 * the source `public/` directory.
 */
export default function animPlugin(): Plugin {
  return {
    name: 'vite-anim-plugin',
    apply: 'build',
    writeBundle(options) {
      const outDir  = options.dir ?? 'dist'
      const srcDir  = join(process.cwd(), 'public', 'game', 'animations')
      const destDir = join(outDir, 'game', 'animations')
      if (!existsSync(srcDir)) return

      for (const file of readdirSync(srcDir)) {
        if (!file.endsWith('.json')) continue

        const track = JSON.parse(readFileSync(join(srcDir, file), 'utf-8')) as TheatreTrackData
        const outFile = file.replace(/\.json$/, '.anim')
        writeFileSync(join(destDir, outFile), encodeAnim(track))

        const copiedJson = join(destDir, file)
        if (existsSync(copiedJson)) rmSync(copiedJson)
      }
    },
  }
}
