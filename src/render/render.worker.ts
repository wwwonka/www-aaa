import * as Comlink from 'comlink'
import { RenderManager } from './RenderManager'
import type { AppState, AppEvent } from '../core/AppOrchestrator'
import './assets/registerDefaultLoaders'

const manager = new RenderManager()

const api = {
  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    await manager.init(canvas, targetFps)
  },

  async setSendToAsm(fn: (event: AppEvent) => void): Promise<void> {
    await manager.setSendToAsm(fn)
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

export type RenderWorkerApi = typeof api

Comlink.expose(api)
