import * as Comlink from 'comlink'
import type { RenderWorkerApi }           from '../render/render.worker'
import { mountEventHandlers }             from './events/_index'
import { installBrowserGuards }           from './browser-guards/_index'
import { detectAppContext }               from './platform/ContextManager'
import { registerServiceWorker }          from './platform/serviceWorkerRegister'
import { appActor, startAppStateMachine } from '../core/AppStateMachine'

export class AppHost {
  async start(): Promise<void> {
    const ctx = detectAppContext()
    installBrowserGuards()
    registerServiceWorker(ctx.runtime)

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

    await renderApi.setSendToAsm(Comlink.proxy((event) => appActor.send(event as any)))

    appActor.subscribe(snapshot => {
      renderApi.showScreen(snapshot.value as any)
    })
    startAppStateMachine()

    window.addEventListener('keydown', (e) => {
      const state = appActor.getSnapshot().value
      if (e.key === ' ') {
        appActor.send({ type: 'CONTROLLER_CONNECTED' })
        appActor.send({ type: 'PLAY' })
      }
      if (e.key === 'Enter') {
        if (state === 'IN_GAME')     appActor.send({ type: 'PAUSE' })
        else if (state === 'PAUSED') appActor.send({ type: 'RESUME' })
      }
    })

    mountEventHandlers({ canvas, renderWorker })
  }
}
