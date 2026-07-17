// Contrat commun à toute source d'entrée (tactile, manette, clavier dev). C'est LA frontière
// qui rend le pipeline agnostique : l'InputHub ne connaît que cette interface, jamais un
// périphérique concret. Une source = un pilote qui remplit une `ControllerFrame`. Toute la
// capture est main-thread (pointer / getGamepads).

import type { ControllerFrame } from '../ControllerFrame';

/** Famille de périphérique — diagnostic uniquement (jamais une logique métier). */
export type InputSourceKind = 'touch' | 'gamepad' | 'keyboard';

/**
 * Une source d'entrée branchable. Cycle de vie : `start()` (pose les listeners / démarre le
 * polling) → `poll()` une fois par tick → `stop()` (nettoyage). Plusieurs sources coexistent ;
 * l'InputHub les fusionne (arbitrage *latest-active-wins*).
 */
export interface InputSource {
  readonly kind: InputSourceKind;

  /** Arme la source (listeners DOM, `gamepadconnected`, etc.). Idempotent. */
  start(): void;

  /** Désarme et nettoie (retire les listeners). Idempotent. */
  stop(): void;

  /**
   * Retourne l'état courant des axes (frame **réutilisée** par la source — zéro alloc, à lire
   * dans le tick, pas au-delà), ou `null` si la source est **désengagée** ce tick (aucune manette
   * branchée, aucun doigt sur l'écran). Une frame retournée peut être neutre (ex. manette au
   * centre). C'est l'InputHub qui décide de la possession à partir de l'activité des axes — la
   * source n'a pas à s'en soucier. Appelée exactement une fois par tick.
   */
  poll(): ControllerFrame | null;
}
