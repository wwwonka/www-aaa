import * as Comlink from 'comlink'
import type { RenderWorkerApi }  from '../render/render.worker'
import { mountEventHandlers }    from './events/_index'
import { installBrowserGuards }  from './browser-guards/_index'
import { detectRuntimeContext }  from './platform/contextDetect'

export class AppHost {
  async start(): Promise<void> {
    detectRuntimeContext()
    installBrowserGuards()

    const canvas = document.getElementById('canvas') as HTMLCanvasElement

    // Taille physique initiale avant le transfert — le worker n'a plus accès à window après
    const dpr     = window.devicePixelRatio ?? 1
    canvas.width  = Math.round(window.innerWidth  * dpr)
    canvas.height = Math.round(window.innerHeight * dpr)

    const offscreen = canvas.transferControlToOffscreen()

    const renderWorker = new Worker(
      new URL('../render/render.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const renderApi = Comlink.wrap<RenderWorkerApi>(renderWorker)

    await renderApi.init(Comlink.transfer(offscreen, [offscreen]))

    mountEventHandlers({ canvas, renderWorker })
  }
}
