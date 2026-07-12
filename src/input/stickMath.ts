// Math pure d'un joystick virtuel (aucune dépendance DOM/Pixi) — levée de l'ancien
// `VirtualStick._updateFrom` pour être partagée par les joysticks DOM. Deadzone radiale
// re-normalisée. Sortie : axes `{x, z}` en [-1,1] + offset pixel du nub pour le dessin.

export const STICK_DEADZONE = 0.15;

const clampUnit = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

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

const NEUTRAL: StickSample = { x: 0, z: 0, nubX: 0, nubY: 0 };

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
  const normX = nubX / maxRadius;
  const normY = nubY / maxRadius;
  const dead = Math.hypot(normX, normY);
  if (dead < STICK_DEADZONE) return { ...NEUTRAL, nubX, nubY };
  const scaled = (dead - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  const inv = scaled / dead;
  return {
    x: clampUnit(normX * inv),
    // Écran : bas = dy positif. Jeu : bas = z négatif → on inverse le vertical (fix inversion).
    z: clampUnit(-normY * inv),
    nubX,
    nubY,
  };
}
