// Entry point — Simulation Worker (boids + Havok), thread dédié du tier `high`. Toute la
// logique d'hébergement (boucle, GameSim) vit dans simHost.ts, partagée avec le worker
// unifié render+sim du tier `low` (voir src/app/platform/workerStrategy.ts).
// En premier — doit être évalué avant tout autre import pour attraper leurs erreurs d'évaluation
// (no-op en prod, voir le fichier).
import '../_dev/workerErrorRelay';
import * as Comlink from 'comlink';
import { createSimHost } from './simHost';
import type { GameSimBuffers } from './simHost';

const host = createSimHost();

const api = {
  init(controlSab: SharedArrayBuffer): Promise<GameSimBuffers> {
    return host.init(controlSab);
  },
  start(): void {
    host.start();
  },
  stop(): void {
    host.stop();
  },
  /** Snapshot de handoff — le buffer part en transfert (zéro copie), pas en clone. */
  // Promise explicite : le type brut doit exposer Promise<ArrayBuffer> pour rester compatible Remote<>.
  capture(): Promise<ArrayBuffer> {
    const buf = host.capture();
    return Promise.resolve(Comlink.transfer(buf, [buf]));
  },
  restore(buf: ArrayBuffer): void {
    host.restore(buf);
  },
};

/** Comlink surface exposed by this worker. */
export type SimulationWorkerApi = typeof api;

Comlink.expose(api);
