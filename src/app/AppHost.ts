import * as Comlink from 'comlink'
import type { RenderWorkerApi } from '../render/render.worker'
import { mountEventHandlers } from './events'

// Contexte d'exécution détecté au démarrage — détermine les capacités disponibles
export type HostMode = 'browser' | 'pwa-standalone' | 'pwa-fullscreen'

function detectHostMode(): HostMode {
  if (!('matchMedia' in window)) return 'browser'
  if (window.matchMedia('(display-mode: fullscreen)').matches) return 'pwa-fullscreen'
  if (window.matchMedia('(display-mode: standalone)').matches) return 'pwa-standalone'
  return 'browser'
}

export class AppHost {
  readonly mode: HostMode = detectHostMode()

  // Références workers — passées aux event handlers pour le relais DOM → worker
  private _renderWorker!: Worker
  renderApi!: Comlink.Remote<RenderWorkerApi>

  async start(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement

    // Taille physique initiale avant le transfert — le worker n'a plus accès à window après
    const dpr     = window.devicePixelRatio ?? 1
    canvas.width  = Math.round(window.innerWidth  * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)

    const offscreen = canvas.transferControlToOffscreen()

    this._renderWorker = new Worker(
      new URL('../render/render.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.renderApi = Comlink.wrap<RenderWorkerApi>(this._renderWorker)

    await this.renderApi.init(Comlink.transfer(offscreen, [offscreen]))

    mountEventHandlers({ canvas, renderWorker: this._renderWorker })
  }
}
