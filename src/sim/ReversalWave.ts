// Demi-tour intentionnel : détection d'une inversion franche des sticks + onde de propagation à
// travers le banc. Détection sur le `moveInput` RÉDUIT (déjà agnostique de la source : manette,
// tactile, RTC). Quand elle déclenche, GameSim téléporte la sphère au nouveau front du flock et
// arme l'onde : le boid le plus proche de la nouvelle sphère bascule en premier, les autres
// suivent en chaîne (délai ∝ distance au nouveau front) ; tant que son délai court, un boid
// continue de seek l'ANCIENNE cible (effet fouet). DOD pur, zéro allocation après création,
// aucun import rendu/DOM. État volontairement éphémère : hors snapshot handoff (reset au restore).

import {
  REVERSAL_ANGLE_COS,
  REVERSAL_MIN_INPUT_MAG,
  REVERSAL_SMOOTH_TAU_MS,
  REVERSAL_COOLDOWN_MS,
  REVERSAL_WAVE_SPEED,
  REVERSAL_WAVE_MAX_DELAY_SEC,
} from '../shared/config';

export interface ReversalWave {
  /**
   * Fait avancer le lissage de la direction « soutenue » et le cooldown, puis dit si l'input
   * courant constitue une inversion franche (magnitudes suffisantes + angle ≥ ~135°).
   * À appeler chaque step, que l'onde soit active ou non.
   */
  detect(inputX: number, inputZ: number, dtSec: number): boolean;
  /** Arme l'onde : délais ∝ distance au nouveau front, mémorise l'ancienne cible du seek. */
  trigger(
    positions: Float32Array,
    count: number,
    newTargetX: number,
    newTargetZ: number,
    oldTargetX: number,
    oldTargetZ: number,
  ): void;
  /** Fait courir l'horloge de l'onde (no-op si aucune onde active). */
  advance(dtSec: number): void;
  /** `true` si ce boid doit encore seek l'ancienne cible (son délai d'activation court toujours). */
  isBoidOnOldTarget(boidIndex: number): boolean;
  readonly waveActive: boolean;
  readonly oldTargetX: number;
  readonly oldTargetZ: number;
  /** Oublie détection ET onde en cours — pour le restore de snapshot (état éphémère). */
  reset(): void;
}

export function createReversalWave(capacity: number): ReversalWave {
  // Direction d'input lissée (EMA) : l'« intention soutenue ». Le passage par le neutre ne
  // l'efface pas instantanément → relâcher-puis-inverser déclenche aussi.
  let smoothX = 0;
  let smoothZ = 0;
  let cooldownSec = 0;

  const delays = new Float32Array(capacity);
  let waveActive = false;
  let waveClock = 0;
  let waveMaxDelay = 0;
  let oldTargetX = 0;
  let oldTargetZ = 0;

  return {
    get waveActive() {
      return waveActive;
    },
    get oldTargetX() {
      return oldTargetX;
    },
    get oldTargetZ() {
      return oldTargetZ;
    },

    detect(inputX, inputZ, dtSec): boolean {
      if (cooldownSec > 0) cooldownSec -= dtSec;

      const prevX = smoothX;
      const prevZ = smoothZ;
      // EMA de constante de temps τ : alpha = dt / (τ + dt).
      const alpha = dtSec / (REVERSAL_SMOOTH_TAU_MS / 1000 + dtSec);
      smoothX += (inputX - smoothX) * alpha;
      smoothZ += (inputZ - smoothZ) * alpha;

      const inputMag = Math.hypot(inputX, inputZ);
      const prevMag = Math.hypot(prevX, prevZ);
      if (cooldownSec > 0) return false;
      if (inputMag < REVERSAL_MIN_INPUT_MAG || prevMag < REVERSAL_MIN_INPUT_MAG) return false;

      const cos = (prevX * inputX + prevZ * inputZ) / (prevMag * inputMag);
      if (cos > REVERSAL_ANGLE_COS) return false;

      // Inversion reconnue : l'intention soutenue devient la nouvelle direction tout de suite
      // (sinon l'EMA traînerait l'ancienne et re-déclencherait au step suivant), + cooldown.
      smoothX = inputX;
      smoothZ = inputZ;
      cooldownSec = REVERSAL_COOLDOWN_MS / 1000;
      return true;
    },

    trigger(positions, count, newTargetX, newTargetZ, oldX, oldZ): void {
      oldTargetX = oldX;
      oldTargetZ = oldZ;
      // Délai de chaque boid ∝ sa distance au nouveau front, rebasée sur le plus proche (délai 0).
      let minDist = Infinity;
      for (let i = 0; i < count; i++) {
        const dx = positions[i * 3] - newTargetX;
        const dz = positions[i * 3 + 2] - newTargetZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        delays[i] = dist;
        if (dist < minDist) minDist = dist;
      }
      waveMaxDelay = 0;
      for (let i = 0; i < count; i++) {
        let delay = (delays[i] - minDist) / REVERSAL_WAVE_SPEED;
        if (delay > REVERSAL_WAVE_MAX_DELAY_SEC) delay = REVERSAL_WAVE_MAX_DELAY_SEC;
        delays[i] = delay;
        if (delay > waveMaxDelay) waveMaxDelay = delay;
      }
      waveClock = 0;
      waveActive = true;
    },

    advance(dtSec): void {
      if (!waveActive) return;
      waveClock += dtSec;
      if (waveClock >= waveMaxDelay) waveActive = false;
    },

    isBoidOnOldTarget(boidIndex): boolean {
      return waveActive && waveClock < delays[boidIndex];
    },

    reset(): void {
      smoothX = 0;
      smoothZ = 0;
      cooldownSec = 0;
      waveActive = false;
      waveClock = 0;
      waveMaxDelay = 0;
    },
  };
}
