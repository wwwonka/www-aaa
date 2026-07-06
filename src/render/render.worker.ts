// En premier — doit être évalué avant tout autre import pour attraper leurs erreurs d'évaluation
// (no-op en prod, voir le fichier).
import '../_dev/workerErrorRelay';
import * as Comlink from 'comlink';
import { RenderManager } from './RenderManager';
import type { PairingActions, ShellContext } from './RenderManager';
import type { AppState, AppEvent } from '../core/AppOrchestrator';
import type { PairingPeerInfo } from '../ui/panels/PairingPanel';
import { devLoadersReady } from './assets/registerDefaultLoaders';

const manager = new RenderManager();

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

  /** Peers du rôle opposé découverts dans la room — chips cliquables sur le receiver. */
  setDiscoveredPeers(peers: PairingPeerInfo[]): void {
    manager.setDiscoveredPeers(peers);
  },

  /** Callbacks réseau (proxy Comlink) invoqués par les chips de pairing — voir `RenderManager.setPairingActions`. */
  setPairingActions(actions: PairingActions): void {
    manager.setPairingActions(actions);
  },

  /** Affiche un toast au-dessus de tout (slide-in depuis le haut, auto-dismiss). */
  showToast(message: string): void {
    manager.showToast(message);
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

  dispose(): void {
    manager.dispose();
  },
};

/** Comlink surface exposed by this worker — mirrors `RenderManager`'s public methods 1:1. */
export type RenderWorkerApi = typeof api;

Comlink.expose(api);
