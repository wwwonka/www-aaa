import { loadAnimation } from '../assets/loadAsset'
import { applyAnimatedValue } from './AnimationRegistry'
import { TrackType, type AnimationTrack, type AnimationTrackSet } from '../assets/loaders/AnimationLoader'

interface PlayingAnimation {
  readonly tracks: AnimationTrackSet
  elapsed:         number
}

const playing: PlayingAnimation[] = []

// Générique — ce module ignore ce qui déclenche la pause (un éditeur externe qui pilote les
// valeurs à la place, ou autre chose plus tard). Voir `RenderManager.pauseAnimationPlayback()`.
let paused = false

export function pausePlayback(): void {
  paused = true
  playing.length = 0
}

export function resumePlayback(): void {
  paused = false
}

/** LERPs `track`'s [time, value] keyframes at `t` (seconds — Theatre.js's own sequence position unit). Only `FLOAT` tracks are implemented — see `AnimationLoader.ts`. */
function sample(track: AnimationTrack, t: number): number {
  const { keyframes } = track
  const count = keyframes.length / 2

  if (t <= keyframes[0]) return keyframes[1]
  if (t >= keyframes[(count - 1) * 2]) return keyframes[(count - 1) * 2 + 1]

  for (let i = 0; i < count - 1; i++) {
    const t0 = keyframes[i * 2]
    const t1 = keyframes[(i + 1) * 2]
    if (t >= t0 && t <= t1) {
      const v0 = keyframes[i * 2 + 1]
      const v1 = keyframes[(i + 1) * 2 + 1]
      const f  = (t - t0) / (t1 - t0)
      return v0 + (v1 - v0) * f
    }
  }
  return keyframes[keyframes.length - 1]
}

/**
 * Loads `<id>.anim` (prod) / `<id>.anim.json` (dev) — one file per screen, containing every track
 * keyframed on that screen's sheet — and starts playing all of them. Pushes interpolated values
 * into {@link applyAnimatedValue} under each track's own id (e.g. `'title.opacity'`), the same sink
 * the dev Theatre.js bridge writes to, so `TitleScreen` (and future animated UI/cinematics) don't
 * know or care which one is driving them.
 */
export async function playAnimation(id: string): Promise<void> {
  if (paused) return
  let tracks: AnimationTrackSet
  try {
    const ext = import.meta.env.DEV ? 'anim.json' : 'anim'
    tracks = await loadAnimation(`${id}.${ext}`)
  } catch (err) {
    console.info(`[AnimationPlayer] no baked animation for "${id}" yet`, err)
    return
  }
  for (const track of Object.values(tracks)) {
    if (track.trackType !== TrackType.FLOAT) throw new Error(`AnimationPlayer: track type ${track.trackType} not implemented for "${id}"`)
  }
  playing.push({ tracks, elapsed: 0 })
}

/** Called every frame by `RenderManager._frame`. `delta` is milliseconds — Theatre positions are seconds. */
export function updateAnimations(delta: number): void {
  if (paused) return
  for (const anim of playing) {
    anim.elapsed += delta / 1000
    for (const [trackId, track] of Object.entries(anim.tracks)) {
      applyAnimatedValue(trackId, sample(track, anim.elapsed))
    }
  }
}
