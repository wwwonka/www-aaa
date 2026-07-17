// Deadzone radiale pure — partagée par toutes les sources d'axes (tactile après
// normalisation pixel, manette dont les axes sont déjà normalisés). Aucune dépendance.

const ZERO = { x: 0, y: 0 } as const;

/**
 * Applique une deadzone **radiale** à un vecteur d'axes normalisé `[-1, 1]`.
 *
 * Sous le seuil (magnitude < `deadzone`) : retourne le vecteur nul — pas de dérive.
 * Au-dessus : ré-échelonne linéairement pour que le **bord** de la deadzone corresponde à
 * `0` et la **pleine déflexion** à `1`, en préservant la direction (pas de saut à la sortie
 * de la zone morte). Radiale (sur la magnitude), pas par-axe : évite les coins carrés.
 *
 * @param x - Axe horizontal normalisé.
 * @param y - Axe vertical normalisé (convention brute de la source ; l'inversion écran/jeu
 *   éventuelle reste à la charge de l'appelant).
 * @param deadzone - Seuil dans `[0, 1)`.
 * @returns Le vecteur ré-échelonné `{ x, y }`, magnitude bornée à `1`.
 */
export function radialDeadzone(x: number, y: number, deadzone: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag < deadzone) return { ...ZERO };
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const factor = scaled / mag;
  return { x: x * factor, y: y * factor };
}
