import { WebGLRenderer, Container, DOMAdapter, WebWorkerAdapter } from 'pixi.js'
// Pixi ships a reduced `webworkerAll` preset that deliberately excludes `events/init` (assumes no
// DOM) — we register it explicitly since our render worker feeds it real events via a relay.
import 'pixi.js/events'
import { createGameUI }         from './layer1_gameUI'
import { createFrozenGameLayer } from './layer2_frozenGame'
import type { FrozenGameLayer } from './layer2_frozenGame'
import { createOverlayUI }      from './layer3_overlay'
import { createNotificationUI } from './layer4_notifications'

// WebWorkerAdapter — requis avant toute création PixiJS dans un worker (pas de document/window)
DOMAdapter.set(WebWorkerAdapter)

// EventSystem._addEvents() référence globalThis.document.addEventListener(...) en dur pour
// pointermove/mousemove (portée document, indépendante du domElement qu'on lui donne) —
// WebWorkerAdapter ne fournit aucun shim de document. Un EventTarget minimal suffit : Pixi n'a
// besoin que d'addEventListener/removeEventListener/dispatchEvent sur cette cible.
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
  (globalThis as unknown as { document: EventTarget }).document = new EventTarget()
}

export interface UIRenderer {
  renderer:       WebGLRenderer
  stage:          Container
  gameUI:         Container
  frozenGame:     FrozenGameLayer
  overlayUI:      Container
  notificationUI: Container
  renderNormal:   (gl: WebGL2RenderingContext, w: number, h: number) => void
  renderSplit:    (gl: WebGL2RenderingContext, w: number, h: number, liveCapture: boolean) => void
  resize:         (width: number, height: number) => void
  destroy:        () => void
}

/**
 * @param gl - The shared WebGL2 context Babylon already owns — Pixi renders into it directly (no separate canvas/context, per project constraints).
 * @param width - Initial viewport width, in pixels.
 * @param height - Initial viewport height, in pixels.
 */
export async function createUIRenderer(
  gl:     WebGL2RenderingContext,
  width:  number,
  height: number,
): Promise<UIRenderer> {
  const renderer = new WebGLRenderer()
  await renderer.init({
    context:           gl,
    width,
    height,
    backgroundAlpha:   0,
    clearBeforeRender: false,
  } as any)

  const stage          = new Container()
  const gameUI         = createGameUI()
  const frozenGame     = createFrozenGameLayer()
  const overlayUI      = createOverlayUI()
  const notificationUI = createNotificationUI()
  stage.addChild(gameUI, frozenGame.container, overlayUI, notificationUI)

  // `EventSystem` normalise d'ordinaire `rootBoundary.rootTarget` sur `renderer.lastObjectRendered`
  // à chaque event, lui-même posé par `render()` seulement quand `options.target` correspond
  // exactement à `renderer.view.renderTarget` — une détection qui échoue silencieusement ici car
  // le renderer partage un contexte GL brut avec Babylon plutôt que de posséder son propre canvas.
  // On fixe la racine une fois, explicitement : `stage` couvre tous les screens interactifs.
  renderer.events.rootBoundary.rootTarget = stage

  return {
    renderer,
    stage,
    gameUI,
    frozenGame,
    overlayUI,
    notificationUI,

    // Mode normal — IN_GAME, une seule passe
    renderNormal(gl: WebGL2RenderingContext, w: number, h: number) {
      gl.viewport(0, 0, w, h)
      renderer.resetState()
      renderer.render({ container: stage, clear: false })
      gl.bindVertexArray(null)
    },

    // Mode splitté — transition pause
    // Passe 1 : gameUI → framebuffer (composite avec Babylon)
    // Capture → texture GL
    // Passe 2 : frozenGame + overlay + notifications par-dessus
    renderSplit(gl: WebGL2RenderingContext, w: number, h: number, liveCapture: boolean) {
      gl.viewport(0, 0, w, h)
      renderer.resetState()

      // Passe 1 — gameUI sur Babylon
      renderer.render({ container: gameUI, clear: false })

      // En RESUMING : capture le frame live (Babylon qui tourne + gameUI) à chaque frame
      if (liveCapture) frozenGame.captureFrame(gl, w, h)

      // Passe 2 — blur + overlay + notifications
      renderer.resetState()
      renderer.render({ container: frozenGame.container, clear: false })
      renderer.render({ container: overlayUI,            clear: false })
      renderer.render({ container: notificationUI,       clear: false })

      gl.bindVertexArray(null)
    },

    resize(w: number, h: number) {
      width  = w
      height = h
      renderer.resize(w, h)
    },

    destroy: () => renderer.destroy(),
  }
}

// Re-exports pour les consumers qui importaient les anciens noms
export { createOverlayUI }      from './layer3_overlay'
export { createNotificationUI } from './layer4_notifications'
