import * as Comlink from 'comlink'
import type { RenderWorkerApi }           from '../render/render.worker'
import { mountEventHandlers }             from './events/_index'
import { installBrowserGuards }           from './guards/_index'
import { detectAppContext }               from './platform/ContextManager'
import { registerServiceWorker }          from './platform/serviceWorkerRegister'
import { appOrchestrator }                from '../core/AppOrchestrator'
import { createAssetsManager }            from '../core/AssetsManager'
import type { AssetsManagerApi }          from '../core/AssetsManager'
import { allocateSystems }                from '../core/SystemAllocator'
import type { SystemHostApi }             from '../core/SystemHost.worker'

/**
 * Boots the app shell: detects the runtime context, installs browser guards, spins up the
 * assets manager (worker or inline, per {@link allocateSystems}), transfers the canvas to the
 * render worker, and wires the orchestrator's screen transitions to the renderer.
 */
export class AppHost {
  /**
   * Runs the full startup sequence and returns the live handles the caller needs
   * once the canvas has been handed off to the render worker.
   */
  async start(): Promise<{ assetsManager: AssetsManagerApi; renderApi: RenderWorkerApi }> {
    const ctx = detectAppContext()
    installBrowserGuards()
    registerServiceWorker(ctx.runtime)

    // SystemAllocator décide si les systèmes "agiles" (AssetsManager aujourd'hui) tournent dans
    // un SystemHost worker dédié ou inline sur le main thread, selon hardwareConcurrency et la
    // règle N-1 — voir docs/system-allocator.md. Sur les appareils avec assez de cœurs, ça évite
    // au warm-up (transactions IDB + fetch par asset) de se battre pour les ticks JS du main
    // thread pendant que Babylon/PixiJS bootstrapent, ni pour ceux du render worker pendant
    // qu'il compile ses shaders ; sur les appareils à peu de cœurs, ça évite un 3ᵉ thread inutile.
    const allocation = allocateSystems(navigator.hardwareConcurrency, ['assetsManager'] as const)
    const assetsManager: AssetsManagerApi =
      allocation.mode === 'worker'
        ? (await Comlink.wrap<SystemHostApi>(
            // name: visible dans l'onglet Threads/Workers de Safari Web Inspector et Chrome
            // DevTools — sans ça, le worker n'apparaît que sous l'URL du fichier .worker.ts.
            new Worker(new URL('../core/SystemHost.worker.ts', import.meta.url), { type: 'module', name: 'SystemHostWorker' }),
          ).get('assetsManager')) as unknown as AssetsManagerApi
        : createAssetsManager()

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
      { type: 'module', name: 'RenderWorker' },
    )
    const renderApi = Comlink.wrap<RenderWorkerApi>(renderWorker)

    await renderApi.init(Comlink.transfer(offscreen, [offscreen]))

    await renderApi.setSendToAsm(Comlink.proxy((event) => appOrchestrator.send(event as any)))

    // xstate émet un nouveau snapshot à chaque `.send()`, y compris les events ASSET_PROGRESS du
    // warmUp() parallélisé (un par asset) — sans déduplication, showScreen() (et donc
    // playAnimation côté Worker) se déclencherait une fois par asset au lieu d'une fois par
    // vrai changement d'écran.
    let lastScreenState: string | undefined
    appOrchestrator.subscribe(snapshot => {
      if (snapshot.value === lastScreenState) return
      lastScreenState = snapshot.value as string
      renderApi.showScreen(snapshot.value as any)
    })
    appOrchestrator.startUp()

    mountEventHandlers({ canvas, renderWorker })

    return { assetsManager, renderApi }
  }
}
