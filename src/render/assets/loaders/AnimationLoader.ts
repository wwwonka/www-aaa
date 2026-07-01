import { registerLoader } from '../registry'
import type { IResourceLoader } from '../types'

// Réservés — VECTOR3/QUATERNION pas encore implémentés, aucun consommateur aujourd'hui (cf. plan :
// le player ne gère que FLOAT tant qu'un vrai second besoin — mesh/caméra — ne justifie l'ajout du
// code d'interpolation Vector3/Quaternion). Objet plain plutôt que `const enum`, incompatible avec
// `erasableSyntaxOnly`.
export const TrackType = { FLOAT: 0, VECTOR3: 1, QUATERNION: 2 } as const
export type TrackType = typeof TrackType[keyof typeof TrackType]

export interface AnimationTrack {
  trackType: TrackType
  /** Paires [time, value] à plat, triées par time croissant. */
  keyframes: Float32Array
}

/**
 * Format `.anim` : `u8 trackType` + `u16 keyframeCount` + `Float32Array` de `[time, value]` par
 * keyframe. Produit hors-ligne par un outil `_dev` qui extrait les courbes d'un export Theatre.js
 * — jamais lu ni écrit par Theatre.js lui-même à l'exécution.
 */
const animationLoader: IResourceLoader<AnimationTrack> = {
  async parse(blob) {
    const buffer = await blob.arrayBuffer()
    const view   = new DataView(buffer)

    const trackType     = view.getUint8(0) as TrackType
    const keyframeCount = view.getUint16(1, true)
    // Byte 3 est du padding — Float32Array exige un byteOffset multiple de 4.
    const keyframes     = new Float32Array(buffer, 4, keyframeCount * 2)

    return { trackType, keyframes }
  },
}

registerLoader(['anim'], animationLoader)
