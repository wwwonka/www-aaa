// Fabrique la façade de contrôle de la simulation (boids + Havok), avec initialisation **différée**
// « title-first » (PR 3) : la façade est appelable immédiatement, mais le spawn du worker + la
// compilation wasm ne partent qu'à `initReal()` (en idle, après le premier paint du title). Les DEUX
// rôles spawnent la sim (préchauffe wasm pour le premier handoff), mais seul le device AUTORITÉ la
// démarre — jamais deux sims ne steppent (CLAUDE.md §4). Topologie selon le tier : worker dédié
// (`high`) ou hébergée dans le worker Render+Sim (`low`), même simHost derrière (src/sim/simHost.ts).

import * as Comlink from 'comlink';
import type { RenderWorkerApi } from '../../render/render.worker';
import type { SimulationWorkerApi } from '../../sim/simulation.worker';
import type { Tier } from './deviceBenchmark';

/** Contrôle de la simulation vu par le reste de l'app (handoff, transitions d'écran). */
export interface SimControl {
  readonly ready: Promise<void>;
  start(): void;
  stop(): void;
  /** Snapshot de handoff (§B.3) — le buffer revient par transfert. */
  capture(): Promise<ArrayBuffer>;
  /** Restaure un snapshot — le buffer part en transfert (inutilisable ensuite côté main). */
  restore(buf: ArrayBuffer): Promise<void>;
}

export interface DeferredSim {
  /** Façade paresseuse : appelable tout de suite ; les appels s'enfilent jusqu'à `initReal()`. */
  readonly sim: SimControl;
  /**
   * Déclenche le vrai spawn worker + init wasm. À appeler en idle après `startUp()` (title-first).
   * Type propriété-fonction (pas méthode) : la façade est destructurée par l'appelant, et une
   * fonction fléchée déjà liée évite l'avertissement `unbound-method`.
   */
  readonly initReal: () => void;
}

export function createDeferredSim(deps: {
  readonly tier: Tier;
  readonly controlSab: SharedArrayBuffer;
  readonly renderApi: Comlink.Remote<RenderWorkerApi>;
}): DeferredSim {
  const { tier, controlSab, renderApi } = deps;

  const createReal = (): SimControl => {
    if (tier === 'high') {
      const simApi = Comlink.wrap<SimulationWorkerApi>(
        new Worker(new URL('../../sim/simulation.worker.ts', import.meta.url), {
          type: 'module',
          name: 'SimulationWorker',
        }),
      );
      return {
        // Buffers SAB relayés au render worker (mémoire partagée, zéro copie).
        ready: simApi.init(controlSab).then(async (buffers) => {
          await renderApi.attachGameBuffers(buffers);
        }),
        start: () => void simApi.start(),
        stop: () => void simApi.stop(),
        capture: () => simApi.capture(),
        restore: (buf) => simApi.restore(Comlink.transfer(buf, [buf])),
      };
    }
    return {
      ready: renderApi.simInit(controlSab).then(() => undefined),
      start: () => void renderApi.simStart(),
      stop: () => void renderApi.simStop(),
      capture: () => renderApi.simCapture(),
      restore: (buf) => renderApi.simRestore(Comlink.transfer(buf, [buf])),
    };
  };

  // Façade paresseuse : les appels arrivés avant l'init s'enfilent sur la promesse dans l'ordre
  // d'émission ; PLAY attend déjà `ready`, comportement identique à une sim synchrone.
  let resolveReal!: (real: SimControl) => void;
  const realSim = new Promise<SimControl>((resolve) => {
    resolveReal = resolve;
  });
  const sim: SimControl = {
    ready: realSim.then((real) => real.ready),
    start: () => void realSim.then((real) => real.start()),
    stop: () => void realSim.then((real) => real.stop()),
    capture: () => realSim.then((real) => real.capture()),
    restore: (buf) => realSim.then((real) => real.restore(buf)),
  };
  // Erreur froide (wasm indisponible…) : loggée, le title reste fonctionnel — PLAY mènera à une
  // arène vide plutôt qu'à un boot cassé.
  sim.ready.catch((err: unknown) => console.error('[AppHost] sim init failed:', err));

  return { sim, initReal: () => resolveReal(createReal()) };
}
