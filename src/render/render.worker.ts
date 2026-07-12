// En premier — doit être évalué avant tout autre import pour attraper leurs erreurs d'évaluation
// (no-op en prod, voir le fichier).
import '../_dev/workerErrorRelay';
import * as Comlink from 'comlink';
import { RenderManager } from './RenderManager';
import type { ShellContext } from './RenderManager';
import type { AppState, AppEvent } from '../core/AppOrchestrator';
import type { PairingPhase } from '../ui/panels/PairingPanel';
import { devLoadersReady } from './assets/registerDefaultLoaders';
import { createSimHost } from '../sim/simHost';
import type { SimHost } from '../sim/simHost';

const manager = new RenderManager();

// Tier `low` (worker unifié Render+Sim, docs/architecture/worker-adaptive-strategy.md) : la sim est
// hébergée ici, sur le même event loop que le rendu — un device à peu de cœurs n'a de
// toute façon qu'un fil d'exécution à offrir, autant s'épargner le context switching.
// Composition au niveau de l'entry worker uniquement : RenderManager reste pur rendu.
let simHost: SimHost | null = null;

const api = {
  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    // Le loader JSON dev-only s'enregistre via un import dynamique (non bloquant au chargement du
    // module — un top-level await ici a fait planter le démarrage du Worker en dev). On attend
    // qu'il soit prêt avant que quoi que ce soit puisse demander une animation.
    await devLoadersReady;
    await manager.init(canvas, targetFps);
  },

  /** Rôle + URL + identité de session, fournis par le main avant `setSendToAsm` — voir `RenderManager.setShellContext`. */
  setShellContext(ctx: ShellContext): void {
    manager.setShellContext(ctx);
  },

  /** Bascule searching ⇄ paired de l'overlay de pairing + prompt du title (`null` = retour à searching). */
  setControllerPaired(peerName: string | null): void {
    manager.setControllerPaired(peerName);
  },

  /** Phase du cycle de pairing (searching/pairing/paired) — source unique côté `pairingHost`. */
  setPairingPhase(phase: PairingPhase, peerName: string | null): void {
    manager.setPairingPhase(phase, peerName);
  },

  async setSendToAsm(fn: (event: AppEvent) => void): Promise<void> {
    await manager.setSendToAsm(fn);
  },

  setOverGameUI(fn: (over: boolean) => void): void {
    manager.setOverGameUI(fn);
  },

  setFps(fps: number): void {
    manager.setFps(fps);
  },

  applyExternalValue(id: string, value: number): void {
    manager.applyExternalValue(id, value);
  },

  pauseAnimationPlayback(): void {
    manager.pauseAnimationPlayback();
  },

  resumeAnimationPlayback(): void {
    manager.resumeAnimationPlayback();
  },

  showScreen(state: AppState): void {
    manager.showScreen(state);
  },

  /**
   * Vues Float32 sur les SAB écrits par le sim worker (matrices boids/props, cible) — le clone
   * structuré d'une TypedArray adossée à un SharedArrayBuffer partage la mémoire, zéro copie.
   */
  attachGameBuffers(buffers: {
    boidMatrices: Float32Array;
    propMatrices: Float32Array;
    targetPosition: Float32Array;
  }): void {
    manager.attachGameBuffers(buffers);
  },

  /** Tier `low` uniquement : héberge la sim dans CE worker et branche ses buffers au rendu. */
  async simInit(controlSab: SharedArrayBuffer): Promise<void> {
    simHost ??= createSimHost();
    const buffers = await simHost.init(controlSab);
    manager.attachGameBuffers(buffers);
  },

  simStart(): void {
    simHost?.start();
  },

  simStop(): void {
    simHost?.stop();
  },

  /** Tier `low` : snapshot de handoff de la sim hébergée — transfert, pas copie. */
  // Promise explicite : le type brut doit exposer Promise<ArrayBuffer> pour rester compatible Remote<>.
  simCapture(): Promise<ArrayBuffer> {
    if (simHost === null) throw new Error('[render.worker] simCapture avant simInit');
    const buf = simHost.capture();
    return Promise.resolve(Comlink.transfer(buf, [buf]));
  },

  simRestore(buf: ArrayBuffer): void {
    if (simHost === null) throw new Error('[render.worker] simRestore avant simInit');
    simHost.restore(buf);
  },

  dispose(): void {
    manager.dispose();
  },
};

/** Comlink surface exposed by this worker — mirrors `RenderManager`'s public methods 1:1. */
export type RenderWorkerApi = typeof api;

Comlink.expose(api);
