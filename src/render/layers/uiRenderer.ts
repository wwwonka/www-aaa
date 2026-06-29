import { WebGLRenderer, Container, DOMAdapter, WebWorkerAdapter } from 'pixi.js'
import { createGameUI }         from './layer1_gameUI'
import { createFrozenGameLayer } from './layer2_frozenGame'
import type { FrozenGameLayer } from './layer2_frozenGame'
import { createOverlayUI }      from './layer3_overlay'
import { createNotificationUI } from './layer4_notifications'

// WebWorkerAdapter — requis avant toute création PixiJS dans un worker (pas de document/window)
DOMAdapter.set(WebWorkerAdapter)

export interface UIRenderer {
  renderer:       WebGLRenderer
  gameUI:         Container
  frozenGame:     FrozenGameLayer
  overlayUI:      Container
  notificationUI: Container
  renderNormal:   (gl: WebGL2RenderingContext, w: number, h: number) => void
  renderSplit:    (gl: WebGL2RenderingContext, w: number, h: number) => void
  resize:         (width: number, height: number) => void
  destroy:        () => void
}

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

  return {
    renderer,
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
    renderSplit(gl: WebGL2RenderingContext, w: number, h: number) {
      gl.viewport(0, 0, w, h)
      renderer.resetState()

      // Passe 1 — gameUI sur Babylon
      renderer.render({ container: gameUI, clear: false })

      // Capture du composite Babylon + gameUI dans la texture du frozenGame
      const texture = (frozenGame.container.children[0] as any)?._texture?.source?.resource
      if (texture) {
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, w, h, 0)
        gl.bindTexture(gl.TEXTURE_2D, null)
      }

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
