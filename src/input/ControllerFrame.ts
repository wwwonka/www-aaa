// La donnée d'entrée **agnostique** du pipeline : la « lingua franca » que chaque source
// (tactile, manette, clavier dev) remplit à l'identique et que l'InputHub consomme. Volontairement
// MUTABLE et remplie in-place — zéro allocation dans le hot path input (une frame par source,
// réécrite chaque tick). Aucune dépendance DOM/transport : purement des nombres.

/** Un stick analogique, axes normalisés `[-1, 1]`. Convention : droite = `+x`, haut = `+z`. */
export interface StickVector {
  x: number;
  z: number;
}

/**
 * Instantané d'état d'un contrôleur, indépendant du périphérique physique.
 *
 * Les **deux** sticks sont conservés en pleine fidélité (jamais réduits à la source) : les moves
 * qui les lisent séparément — split (sticks divergents), dash chargé — vivront côté sim et ont
 * besoin des deux vecteurs. La réduction éventuelle en une direction unique est une décision
 * de transport/gameplay, pas de capture.
 */
export interface ControllerFrame {
  readonly leftStick: StickVector;
  readonly rightStick: StickVector;
  /**
   * Actions discrètes pressées (dash, split…) sous forme de bitset d'`ActionId`.
   * **RÉSERVÉ** — non peuplé pour l'instant (passe « sticks d'abord »). Voir le plan
   * `docs/plans/input-system-agnostic.md` §Séquences pour le chemin actions à venir.
   */
  actions: number;
}

/** Crée une frame neutre, à réutiliser (remplie in-place par la suite). */
export function createControllerFrame(): ControllerFrame {
  return { leftStick: { x: 0, z: 0 }, rightStick: { x: 0, z: 0 }, actions: 0 };
}

/** Remet une frame à neutre (sticks à zéro, aucune action). */
export function resetControllerFrame(frame: ControllerFrame): void {
  frame.leftStick.x = 0;
  frame.leftStick.z = 0;
  frame.rightStick.x = 0;
  frame.rightStick.z = 0;
  frame.actions = 0;
}

/** `true` si au moins un stick est hors du centre (une action est en cours sur cette frame). */
export function isControllerFrameActive(frame: ControllerFrame): boolean {
  return (
    frame.leftStick.x !== 0 ||
    frame.leftStick.z !== 0 ||
    frame.rightStick.x !== 0 ||
    frame.rightStick.z !== 0
  );
}
