export interface StickAxes {
  readonly x: number;
  readonly z: number;
}

/**
 * Réduit deux sticks vers une direction unique (policy étape 5b) : moyenne des deux sticks,
 * renormalisée si magnitude > 1.
 *
 * La locomotion exige les DEUX sticks actifs, **intentionnellement** : un seul stick (ou aucun)
 * = vecteur nul, le banc ne bouge pas — le contrôle à deux pouces est le geste de base du jeu.
 * Deux sticks opposés se neutralisent — c'est le neutre attendu du futur geste split
 * (sticks divergents).
 */
export function reduceSticks(left: StickAxes, right: StickAxes): StickAxes {
  const leftActive = left.x !== 0 || left.z !== 0;
  const rightActive = right.x !== 0 || right.z !== 0;

  if (!leftActive || !rightActive) return { x: 0, z: 0 };

  const x = (left.x + right.x) * 0.5;
  const z = (left.z + right.z) * 0.5;
  const mag = Math.hypot(x, z);
  if (mag <= 1) return { x, z };
  return { x: x / mag, z: z / mag };
}
