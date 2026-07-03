import * as Comlink from 'comlink'
import { RenderManager } from './RenderManager'
import type { AppState, AppEvent } from '../core/AppOrchestrator'
import { devLoadersReady } from './assets/registerDefaultLoaders'

const manager = new RenderManager()

const api = {
  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    // Le loader JSON dev-only s'enregistre via un import dynamique (non bloquant au chargement du
    // module — un top-level await ici a fait planter le démarrage du Worker en dev). On attend
    // qu'il soit prêt avant que quoi que ce soit puisse demander une animation.
    await devLoadersReady
    await manager.init(canvas, targetFps)
  },

  async setSendToAsm(fn: (event: AppEvent) => void): Promise<void> {
    await manager.setSendToAsm(fn)
  },

  async setOverGameUI(fn: (over: boolean) => void): Promise<void> {
    await manager.setOverGameUI(fn)
  },

  setFps(fps: number): void {
    manager.setFps(fps)
  },

  applyExternalValue(id: string, value: number): void {
    manager.applyExternalValue(id, value)
  },

  pauseAnimationPlayback(): void {
    manager.pauseAnimationPlayback()
  },

  resumeAnimationPlayback(): void {
    manager.resumeAnimationPlayback()
  },

  showScreen(state: AppState): void {
    manager.showScreen(state)
  },

  dispose(): void {
    manager.dispose()
  },
}

/** Comlink surface exposed by this worker — mirrors `RenderManager`'s public methods 1:1. */
export type RenderWorkerApi = typeof api

Comlink.expose(api)
