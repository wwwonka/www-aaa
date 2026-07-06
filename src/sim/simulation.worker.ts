// Entry point — Simulation Worker (boids + Havok). Héberge GameSim sur un thread dédié :
// la boucle est auto-cadencée ici (setTimeout + accumulateur GameSim, pas de rAF en worker),
// les résultats partent par SharedArrayBuffer (matrices), le contrôle par Comlink (froid).
// En premier — doit être évalué avant tout autre import pour attraper leurs erreurs d'évaluation
// (no-op en prod, voir le fichier).
import '../_dev/workerErrorRelay';
import * as Comlink from 'comlink';
import { createGameSim } from './GameSim';
import type { GameSim } from './GameSim';
import { SIM_STEP_MS } from '../shared/config';

let sim: GameSim | null = null;
let running = false;
let timerId: ReturnType<typeof setTimeout> | null = null;
let lastTickTs = 0;

/** Vues SAB retournées au main — postées ensuite au render worker (même mémoire, zéro copie). */
export interface GameSimBuffers {
  readonly boidMatrices: Float32Array;
  readonly propMatrices: Float32Array;
  readonly targetPosition: Float32Array;
  readonly boidCount: number;
  readonly propCount: number;
}

const tick = (): void => {
  if (!running || sim === null) return;
  const now = performance.now();
  sim.update(now - lastTickTs);
  lastTickTs = now;
  // Cadence sous le pas fixe : l'accumulateur de GameSim absorbe le jitter du timer.
  timerId = setTimeout(tick, SIM_STEP_MS / 2);
};

const api = {
  /** Idempotent — précharge le wasm Havok et construit la scène physique (appelé au boot, pendant le title). */
  async init(): Promise<GameSimBuffers> {
    sim ??= await createGameSim();
    return {
      boidMatrices: sim.boidMatrices,
      propMatrices: sim.propMatrices,
      targetPosition: sim.targetPosition,
      boidCount: sim.boidCount,
      propCount: sim.propCount,
    };
  },

  /** Démarre la boucle 60 Hz — appelé sur transition `IN_GAME`. */
  start(): void {
    if (sim === null || running) return;
    running = true;
    lastTickTs = performance.now();
    tick();
  },

  /** Fige la simulation (l'état physique est conservé) — appelé en quittant `IN_GAME`. */
  stop(): void {
    running = false;
    if (timerId !== null) clearTimeout(timerId);
  },

  /** Direction de la sphère de contrôle — clavier dev aujourd'hui, joysticks RTC à l'étape 5. */
  setMoveInput(dirX: number, dirZ: number): void {
    sim?.setMoveInput(dirX, dirZ);
  },
};

/** Comlink surface exposed by this worker. */
export type SimulationWorkerApi = typeof api;

Comlink.expose(api);
