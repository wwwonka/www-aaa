import { registerLoader } from '../registry'
import type { IResourceLoader } from '../types'

// Réservés — VECTOR3/QUATERNION pas encore implémentés, aucun consommateur aujourd'hui (le player
// ne gère que FLOAT tant qu'un vrai second besoin — mesh/caméra — ne justifie l'ajout du code
// d'interpolation Vector3/Quaternion). Objet plain plutôt que `const enum`, incompatible avec
// `erasableSyntaxOnly`.
export const TrackType = { FLOAT: 0, VECTOR3: 1, QUATERNION: 2 } as const
export type TrackType = typeof TrackType[keyof typeof TrackType]

export interface AnimationTrack {
  trackType: TrackType
  /** Paires [time, value] à plat, triées par time croissant. */
  keyframes: Float32Array
}

/** Un fichier = un écran (sheet Theatre), potentiellement plusieurs pistes — une par `objectKey.prop` keyframé. */
export type AnimationTrackSet = Record<string, AnimationTrack>

/**
 * Format `.anim` : `u16 trackCount`, puis par piste — `u8 idLength` + id UTF-8 (ex. `"title.opacity"`)
 * + `u8 trackType` + `u16 keyframeCount` + `keyframeCount` paires `[time, value]` en float32 —
 * séquentiel, pas d'offsets fixes (la longueur d'id variable empêcherait un alignement 4 octets
 * stable, donc les floats sont lus un par un via `DataView` plutôt que vus comme `Float32Array`
 * sur le buffer). Produit hors-ligne par `_dev/vite-anim-plugin.ts` à partir d'un export Theatre.js
 * — jamais lu ni écrit par Theatre.js lui-même à l'exécution.
 */
const animationLoader: IResourceLoader<AnimationTrackSet> = {
  async parse(blob) {
    const buffer = await blob.arrayBuffer()
    const view   = new DataView(buffer)
    const utf8   = new TextDecoder()

    let offset = 0
    const trackCount = view.getUint16(offset, true); offset += 2

    const tracks: AnimationTrackSet = {}
    for (let i = 0; i < trackCount; i++) {
      const idLength = view.getUint8(offset); offset += 1
      const id       = utf8.decode(new Uint8Array(buffer, offset, idLength)); offset += idLength

      const trackType     = view.getUint8(offset) as TrackType; offset += 1
      const keyframeCount = view.getUint16(offset, true); offset += 2

      const keyframes = new Float32Array(keyframeCount * 2)
      for (let k = 0; k < keyframeCount * 2; k++) {
        keyframes[k] = view.getFloat32(offset, true)
        offset += 4
      }

      tracks[id] = { trackType, keyframes }
    }

    return tracks
  },
}

registerLoader(['anim'], 'anim', animationLoader)
