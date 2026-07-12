import * as Comlink from 'comlink'
import { RenderManager } from './RenderManager'

const manager = new RenderManager()

const api = {
  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    await manager.init(canvas, targetFps)
  },

  setFps(fps: number): void {
    manager.setFps(fps)
  },

  dispose(): void {
    manager.dispose()
  },
}

export type RenderWorkerApi = typeof api

Comlink.expose(api)
