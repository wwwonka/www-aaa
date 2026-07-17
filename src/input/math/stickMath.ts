// Math pure d'un joystick virtuel **tactile** (aucune dépendance DOM/Pixi) : convertit un
// offset pointeur→base en pixels vers des axes `{x, z}` normalisés + l'offset pixel du nub
// pour le dessin. La deadzone radiale est déléguée à `radialDeadzone` (partagée avec la manette).

import { radialDeadzone } from './deadzone';

export const STICK_DEADZONE = 0.15;

export interface StickSample {
  /** Axe horizontal en [-1,1] (droite = +x). */
  readonly x: number;
  /** Axe vertical en [-1,1] — **haut de l'écran = +z** (aligné sur la convention clavier de la
   *  sim : `ArrowUp` → `z+`). L'ancien joystick Pixi inversait cet axe (bug corrigé ici). */
  readonly z: number;
  /** Offset pixel du nub relatif à la base, borné à `maxRadius` — pour positionner le visuel. */
  readonly nubX: number;
  readonly nubY: number;
}

/**
 * Échantillonne un stick depuis l'offset pointeur→base (`dx`,`dy` en pixels écran) et le rayon max.
 *
 * @param dx - pointeur.x − base.x (pixels, droite positif).
 * @param dy - pointeur.y − base.y (pixels, **bas** positif — écran).
 * @param maxRadius - rayon max du stick (pixels).
 */
export function sampleStick(dx: number, dy: number, maxRadius: number): StickSample {
  const mag = Math.hypot(dx, dy);
  const clamped = mag > maxRadius && mag > 0 ? maxRadius / mag : 1;
  const nubX = dx * clamped;
  const nubY = dy * clamped;
  const { x, y } = radialDeadzone(nubX / maxRadius, nubY / maxRadius, STICK_DEADZONE);
  return {
    x,
    // Écran : bas = dy positif. Jeu : bas = z négatif → on inverse le vertical (fix inversion).
    z: -y,
    nubX,
    nubY,
  };
}
