// Écrivains main-thread du SAB de contrôle (main → sim, CLAUDE.md §7). Un seul écrivain
// par cellule (le main), un seul lecteur (la sim, `drainControl` dans GameSim) — les
// Atomics suffisent, pas de lock. Zéro allocation : appelable en hot path input.
import {
  CTRL_AXIS_X,
  CTRL_AXIS_Z,
  CTRL_RING_WRITE,
  CTRL_RING_READ,
  CTRL_RING_BASE,
  CTRL_RING_SLOTS,
  CTRL_RING_SLOT_STRIDE,
  CTRL_FIXED_POINT,
} from '../../shared/constants';
import type { ActionId } from '../../shared/constants';

const clamp = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

/** Axes de déplacement normalisés `[-1, 1]` — policy latest-wins : chaque écriture écrase la précédente. */
export function writeAxes(controlView: Int32Array, dirX: number, dirZ: number): void {
  Atomics.store(controlView, CTRL_AXIS_X, (clamp(dirX) * CTRL_FIXED_POINT) | 0);
  Atomics.store(controlView, CTRL_AXIS_Z, (clamp(dirZ) * CTRL_FIXED_POINT) | 0);
}

/**
 * Enfile une action discrète (dash, split…) — contrairement aux axes, aucune ne doit être
 * perdue. Ring plein (le sim a > `CTRL_RING_SLOTS` steps de retard) : l'action est lâchée,
 * signalé en dev — un input de 64 actions d'avance est un symptôme, pas un cas à absorber.
 */
export function pushAction(controlView: Int32Array, actionId: ActionId, argFixedPoint = 0): void {
  const write = Atomics.load(controlView, CTRL_RING_WRITE);
  if (write - Atomics.load(controlView, CTRL_RING_READ) >= CTRL_RING_SLOTS) {
    if (import.meta.env.DEV) console.warn('[controlChannel] action ring full — action dropped');
    return;
  }
  const base = CTRL_RING_BASE + (write % CTRL_RING_SLOTS) * CTRL_RING_SLOT_STRIDE;
  Atomics.store(controlView, base, actionId);
  Atomics.store(controlView, base + 1, argFixedPoint);
  Atomics.store(controlView, CTRL_RING_WRITE, write + 1);
}
