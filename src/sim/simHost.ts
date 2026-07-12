// Hébergeur de GameSim réutilisable par n'importe quel worker : boucle 60 Hz auto-cadencée
// (setTimeout demi-pas + accumulateur GameSim — pas de rAF fiable en worker), résultats par
// SAB, contrôle par appels directs (Comlink côté worker dédié, appel local en mode fusionné).
// Consommé par simulation.worker.ts (tier high) et render.worker.ts (tier low, worker unifié).
import { createGameSim } from './GameSim';
import type { GameSim } from './GameSim';
import { SIM_STEP_MS } from '../shared/config';

/** Vues SAB retournées à l'init — postées au render (même mémoire, zéro copie) ou consommées sur place. */
export interface GameSimBuffers {
  readonly boidMatrices: Float32Array;
  readonly propMatrices: Float32Array;
  readonly targetPosition: Float32Array;
  readonly boidCount: number;
  readonly propCount: number;
}

export interface SimHost {
  /** Idempotent — précharge le wasm Havok et construit la scène physique. `controlSab` = SAB de contrôle (CLAUDE.md §7). */
  init(controlSab: SharedArrayBuffer): Promise<GameSimBuffers>;
  /** Démarre la boucle 60 Hz — appelé sur transition `IN_GAME`. */
  start(): void;
  /** Fige la simulation (l'état physique est conservé) — appelé en quittant `IN_GAME`. */
  stop(): void;
  /** Snapshot binaire complet (§B.3) — chemin froid, sim stoppée de préférence. Jette avant `init`. */
  capture(): ArrayBuffer;
  /** Restaure un snapshot — jette avant `init` ou si le snapshot est incompatible. */
  restore(buf: ArrayBuffer): void;
}

export function createSimHost(): SimHost {
  let sim: GameSim | null = null;
  let running = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastTickTs = 0;

  const tick = (): void => {
    if (!running || sim === null) return;
    const now = performance.now();
    sim.update(now - lastTickTs);
    lastTickTs = now;
    // Cadence sous le pas fixe : l'accumulateur de GameSim absorbe le jitter du timer.
    timerId = setTimeout(tick, SIM_STEP_MS / 2);
  };

  return {
    async init(controlSab: SharedArrayBuffer): Promise<GameSimBuffers> {
      sim ??= await createGameSim(new Int32Array(controlSab));
      return {
        boidMatrices: sim.boidMatrices,
        propMatrices: sim.propMatrices,
        targetPosition: sim.targetPosition,
        boidCount: sim.boidCount,
        propCount: sim.propCount,
      };
    },

    start(): void {
      if (sim === null || running) return;
      running = true;
      lastTickTs = performance.now();
      tick();
    },

    stop(): void {
      running = false;
      if (timerId !== null) clearTimeout(timerId);
    },

    capture(): ArrayBuffer {
      if (sim === null) throw new Error('[simHost] capture avant init');
      return sim.captureSnapshot();
    },

    restore(buf: ArrayBuffer): void {
      // Fail-fast (§B.6) : un restore ne peut pas arriver avant l'init résolue — les deux
      // rôles initialisent au boot (préchauffe wasm), un hoState plus tôt est un bug.
      if (sim === null) throw new Error('[simHost] restore avant init');
      sim.restoreSnapshot(buf);
    },
  };
}
