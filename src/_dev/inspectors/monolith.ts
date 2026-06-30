import { RenderManager }                   from '../../render/RenderManager'
import { detectAppContext }                from '../../app/platform/ContextManager'
import { appOrchestrator }                 from '../../core/AppOrchestrator'
import { installBrowserGuards }            from '../../app/browser-guards/_index'
import { registerServiceWorker }           from '../../app/platform/serviceWorkerRegister'
import { DebugOverlay }                    from '../overlay/DebugOverlay'
import { setupDevTools }                   from '../setup'

// TODO: Les méthodes debug (scene, resize, setVisibility, attachDebugOverlay, etc.)
// seront rajoutées à RenderManager quand on implémente le debug tooling complet.
// En attendant, on cast en any pour garder le fichier compilable.

export async function startMonolithMode(): Promise<void> {
  const ctx = detectAppContext()
  installBrowserGuards()
  registerServiceWorker(ctx.runtime)

  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const dpr    = window.devicePixelRatio ?? 1
  canvas.width  = Math.round(window.innerWidth  * dpr)
  canvas.height = Math.round(window.innerHeight * dpr)

  const manager = new RenderManager() as any

  await manager.init(canvas)

  // @babylonjs/inspector doit être installé (pnpm add -D @babylonjs/inspector) avant d'activer ces lignes
  // await import('@babylonjs/inspector')
  // manager.scene.debugLayer.show({ embedMode: true })

  const overlay = new DebugOverlay()
  manager.attachDebugOverlay(overlay)

  const renderApi = {
    showScreen:         (state: any)  => manager.showScreen(state),
    setFps:             (fps: number) => manager.setFps(fps),
    setWireframe:       (v: boolean)  => manager.setWireframe(v),
    showBoundingBoxes:  (v: boolean)  => manager.showBoundingBoxes(v),
    dumpSceneStats:     ()            => manager.dumpSceneStats(),
    toggleDebugOverlay: ()            => overlay.toggle(),
  }

  appOrchestrator.subscribe(snapshot => renderApi.showScreen(snapshot.value as any))
  appOrchestrator.startUp()

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const dpr  = window.devicePixelRatio ?? 1
      const size = entry.devicePixelContentBoxSize?.[0]
      const w    = size ? size.inlineSize : Math.round(entry.contentRect.width  * dpr)
      const h    = size ? size.blockSize  : Math.round(entry.contentRect.height * dpr)
      canvas.width  = w
      canvas.height = h
      manager.resize(w, h)
    }
  })
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' } as ResizeObserverOptions)
  } catch {
    observer.observe(canvas, { box: 'content-box' })
  }

  document.addEventListener('visibilitychange', () => {
    manager.setVisibility(!document.hidden)
  })

  setupDevTools(ctx, renderApi)
}
