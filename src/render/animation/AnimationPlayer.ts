import { loadAnimation } from '../assets/loadAsset'
import { applyAnimatedValue } from './AnimationRegistry'
import { TrackType, type AnimationTrack, type AnimationTrackSet } from '../assets/loaders/AnimationLoader'

interface PlayingAnimation {
  readonly id:     string
  readonly tracks: AnimationTrackSet
  elapsed:         number
}

const playing: PlayingAnimation[] = []

// Générique — ce module ignore ce qui déclenche la pause (un éditeur externe qui pilote les
// valeurs à la place, ou autre chose plus tard). Voir `RenderManager.pauseAnimationPlayback()`.
let paused = false

/** Stops all playback and drops every in-flight animation — see `RenderManager.pauseAnimationPlayback()`. */
export function pausePlayback(): void {
  paused = true
  playing.length = 0
}

/** Re-enables `playAnimation`/`updateAnimations` after {@link pausePlayback}. Does not resume anything on its own — callers must re-invoke `playAnimation` for whatever should be playing. */
export function resumePlayback(): void {
  paused = false
}

/**
 * LERPs `track`'s `[time, value]` keyframes at `t` (seconds — Theatre.js's own sequence position
 * unit). Only `FLOAT` tracks are implemented — see `AnimationLoader.ts`.
 *
 * @param track - Source keyframes, sorted by ascending time.
 * @param t - Sample time in seconds. Clamped to the track's first/last keyframe if out of range.
 * @returns The interpolated value at `t`.
 */
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
 *
 * @param id - Base filename under `public/game/anim/` (no extension) — matches an
 * `AnimationScenario.fileName`, e.g. `'title-screen'`.
 * @throws If a loaded track has a `trackType` other than `FLOAT` (unimplemented — see `AnimationLoader.ts`).
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
  // Remplace toute lecture en cours pour ce même id plutôt que d'empiler — un screen dont
  // `onEnter()` est ré-invoqué (ex. `ScreenManager.replayCurrentReveal()` après le mode Authoring,
  // ou une simple revisite de l'écran) ne doit pas accumuler une entrée `playing` par visite.
  const existing = playing.findIndex(anim => anim.id === id)
  const next = { id, tracks, elapsed: 0 }
  if (existing !== -1) playing[existing] = next
  else playing.push(next)
}

/**
 * Advances every playing animation and pushes freshly-sampled values to {@link applyAnimatedValue}.
 * Called every frame by `RenderManager._frame`.
 *
 * @param delta - Elapsed time since the last frame, in **milliseconds** (converted to seconds internally — Theatre positions are seconds).
 */
export function updateAnimations(delta: number): void {
  if (paused) return
  for (const anim of playing) {
    anim.elapsed += delta / 1000
    for (const [trackId, track] of Object.entries(anim.tracks)) {
      applyAnimatedValue(trackId, sample(track, anim.elapsed))
    }
  }
}
