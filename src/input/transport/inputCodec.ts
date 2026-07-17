// Codec du payload input RTC (docs/progress/design-etapes-5-6.md §A.3) — 6 octets
// little-endian : int16 dirX | int16 dirZ | uint16 seq. Le canal Trystero est
// reliable+ordered (suffisant à ~30 Hz en LAN) ; `seq` prépare un futur canal unordered.
// Zéro allocation : l'appelant réutilise ses vues et son objet de sortie.
import { INPUT_AXIS_QUANT } from '../../shared/constants';

const clamp = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

export interface DecodedInput {
  dirX: number;
  dirZ: number;
  seq: number;
}

/** Écrit les axes normalisés `[-1, 1]` + le compteur `seq` dans la vue fournie. */
export function encodeInput(target: DataView, dirX: number, dirZ: number, seq: number): void {
  target.setInt16(0, Math.round(clamp(dirX) * INPUT_AXIS_QUANT), true);
  target.setInt16(2, Math.round(clamp(dirZ) * INPUT_AXIS_QUANT), true);
  target.setUint16(4, seq & 0xffff, true);
}

/** Décode dans `out` — pas d'objet neuf sur le chemin réseau. */
export function decodeInput(view: DataView, out: DecodedInput): void {
  out.dirX = view.getInt16(0, true) / INPUT_AXIS_QUANT;
  out.dirZ = view.getInt16(2, true) / INPUT_AXIS_QUANT;
  out.seq = view.getUint16(4, true);
}
