import { registerLoader } from '../../render/assets/registry'
import type { IResourceLoader } from '../../render/assets/types'
import { TrackType, type AnimationTrackSet } from '../../render/assets/loaders/AnimationLoader'
import { extractSheetTracks, type TheatreOnDiskState } from './theatreState'

/**
 * DEV-only counterpart to `AnimationLoader.ts` (binary, prod) — registered on `.anim.json` from
 * `registerDefaultLoaders.ts` behind an `import.meta.env.DEV` guard, so this module (and any trace
 * of JSON/Theatre-state parsing) never reaches the production bundle. Reads Theatre.js's real
 * on-disk project state (`studio.createContentOfSaveFile()`'s shape — see `theatreState.ts`) and
 * produces the exact same in-memory `AnimationTrackSet` as the binary loader —
 * `AnimationPlayer`/`AnimationRegistry` never know which one ran.
 *
 * One file = one sheet (screen). The sheet name to read is the file's own basename minus
 * extension is NOT assumed — the file is expected to contain a single sheet under `sheetsById`
 * (that's what `studio.createContentOfSaveFile(projectId)` sliced per-sheet looks like), so the
 * first (and only) key is used directly.
 */
const jsonAnimationLoader: IResourceLoader<AnimationTrackSet> = {
  async parse(blob) {
    const state = JSON.parse(await blob.text()) as TheatreOnDiskState
    const [sheetName] = Object.keys(state.sheetsById)
    const flatTracks = sheetName ? extractSheetTracks(state, sheetName) : {}

    const tracks: AnimationTrackSet = {}
    for (const [id, track] of Object.entries(flatTracks)) {
      const sorted    = [...track.keyframes].sort((a, b) => a.position - b.position)
      const keyframes = new Float32Array(sorted.length * 2)
      sorted.forEach((k, i) => {
        keyframes[i * 2]     = k.position
        keyframes[i * 2 + 1] = k.value
      })
      tracks[id] = { trackType: TrackType.FLOAT, keyframes }
    }

    return tracks
  },
}

// `extensionOf()` (loadAsset.ts) prend tout après le DERNIER point — pour "title-screen.anim.json"
// ça donne "json", pas "anim.json" ; "anim" ne reste qu'un infixe sémantique du nom de fichier.
registerLoader(['json'], 'anim', jsonAnimationLoader)
