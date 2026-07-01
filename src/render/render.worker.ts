import * as Comlink from 'comlink'
import { RenderManager } from './RenderManager'
import type { AppState, AppEvent } from '../core/AppOrchestrator'
import './assets/registerDefaultLoaders'

const manager = new RenderManager()

const api = {
  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    await manager.init(canvas, targetFps)
  },

  setSendToAsm(fn: (event: AppEvent) => void): void {
    manager.setSendToAsm(fn)
  },

  setFps(fps: number): void {
    manager.setFps(fps)
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
