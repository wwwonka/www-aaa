import * as Comlink from 'comlink'
import type { RenderWorkerApi }           from '../render/render.worker'
import { mountEventHandlers }             from './events/_index'
import { installBrowserGuards }           from './browser-guards/_index'
import { detectAppContext }               from './platform/ContextManager'
import { registerServiceWorker }          from './platform/serviceWorkerRegister'
import { appOrchestrator }                from '../core/AppOrchestrator'
import type { AssetsManagerApi }          from '../core/AssetsManager'

export class AppHost {
  async start(): Promise<void> {
    const ctx = detectAppContext()
    installBrowserGuards()
    registerServiceWorker(ctx.runtime)

    // Worker dédié (pas le render worker) — le warm-up (transactions IDB + fetch par asset)
    // ne doit pas se battre pour les ticks JS du main thread pendant que Babylon/PixiJS
    // bootstrapent, ni pour ceux du render worker pendant qu'il compile ses shaders.
    const assetsWorker = new Worker(
      new URL('../core/assetsManager.worker.ts', import.meta.url),
      { type: 'module' },
    )
    const assetsManager = Comlink.wrap<AssetsManagerApi>(assetsWorker)

    // TODO: séquencer namespace 'app' (menu) puis 'game' (simulation) une fois le
    // chargement granulaire piloté par AppOrchestrator — pour l'instant tout d'un coup.
    assetsManager.warmUp(undefined, Comlink.proxy(event => appOrchestrator.send({ ...event, type: `ASSET_${event.type.toUpperCase()}` } as any)))

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

    await renderApi.setSendToAsm(Comlink.proxy((event) => appOrchestrator.send(event as any)))

    appOrchestrator.subscribe(snapshot => {
      renderApi.showScreen(snapshot.value as any)
    })
    appOrchestrator.startUp()

    window.addEventListener('keydown', (e) => {
      const state = appOrchestrator.getSnapshot().value
      if (e.key === ' ') {
        appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' })
        appOrchestrator.send({ type: 'PLAY' })
        assetsManager.persist()
      }
      if (e.key === 'Enter') {
        if (state === 'IN_GAME')     appOrchestrator.send({ type: 'PAUSE' })
        else if (state === 'PAUSED') appOrchestrator.send({ type: 'RESUME' })
      }
    })

    mountEventHandlers({ canvas, renderWorker })
  }
}
