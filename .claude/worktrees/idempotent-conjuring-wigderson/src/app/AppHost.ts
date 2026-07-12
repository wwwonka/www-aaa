import * as Comlink from 'comlink'
import type { RenderWorkerApi }           from '../render/render.worker'
import { mountEventHandlers }             from './events/_index'
import { installBrowserGuards }           from './browser-guards/_index'
import { detectRuntimeContext }           from './platform/contextDetect'
import { appActor, startAppStateMachine } from '../core/AppStateMachine'

export class AppHost {
  async start(): Promise<void> {
    const ctx = detectRuntimeContext()
    if (import.meta.env.DEV) {
      import('../_dev/logger').then(({ createGroupLogger }) => {
        const log = createGroupLogger('AppHost', '#2c3e50')
        log.group(ctx.category)
        log.row('category', ctx.category)
        log.groupEnd()
      })
    }

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

    // Branche l'ASM — chaque transition d'état met à jour le render worker
    appActor.subscribe(snapshot => {
      renderApi.showScreen(snapshot.value as any)
    })
    startAppStateMachine()

    // Enter toggle pause / resume
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const state = appActor.getSnapshot().value
      if (state === 'IN_GAME') appActor.send({ type: 'PAUSE' })
      else if (state === 'PAUSED') appActor.send({ type: 'RESUME' })
    })

    mountEventHandlers({ canvas, renderWorker })
  }
}
