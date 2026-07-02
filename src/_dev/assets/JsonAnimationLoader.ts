import { registerLoader } from '../../render/assets/registry'
import type { IResourceLoader } from '../../render/assets/types'
import { TrackType, type AnimationTrack } from '../../render/assets/loaders/AnimationLoader'

/**
 * Theatre.js's own on-disk keyframe shape (`Keyframe`/`BasicKeyframedTrack` in `@theatre/core`) —
 * this loader reads it verbatim, no custom schema. One file per track, matching our per-id
 * `${objectKey}.${prop}.json` convention (`public/game/animations/title.opacity.json`) — slicing
 * a full Theatre project export down to one track per file is the export tool's job, not this
 * loader's.
 */
interface TheatreKeyframe {
  position: number
  value: number
}

interface TheatreTrackData {
  type: 'BasicKeyframedTrack'
  keyframes: TheatreKeyframe[]
}

/**
 * DEV-only counterpart to `AnimationLoader.ts` (binary, prod) — registered on `.json` from
 * `registerDefaultLoaders.ts` behind an `import.meta.env.DEV` guard, so this module (and any trace
 * of JSON parsing) never reaches the production bundle. Produces the exact same in-memory
 * `AnimationTrack` shape as the binary loader — `AnimationPlayer`/`AnimationRegistry` never know
 * which one ran.
 */
const jsonAnimationLoader: IResourceLoader<AnimationTrack> = {
  async parse(blob) {
    const track: TheatreTrackData = JSON.parse(await blob.text())
    const sorted = [...track.keyframes].sort((a, b) => a.position - b.position)

    const keyframes = new Float32Array(sorted.length * 2)
    sorted.forEach((k, i) => {
      keyframes[i * 2]     = k.position
      keyframes[i * 2 + 1] = k.value
    })

    return { trackType: TrackType.FLOAT, keyframes }
  },
}

registerLoader(['json'], jsonAnimationLoader)
