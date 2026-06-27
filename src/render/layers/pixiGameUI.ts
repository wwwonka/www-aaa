import { WebGLRenderer, Container, DOMAdapter, WebWorkerAdapter } from 'pixi.js'

// WebWorkerAdapter — requis avant toute création PixiJS dans un worker (pas de document/window)
DOMAdapter.set(WebWorkerAdapter)

export interface PixiGameUI {
  gameContainer:  Container
  shellContainer: Container
  render:         (gl: WebGL2RenderingContext, width: number, height: number) => void
  destroy:        () => void
}

export async function createPixiGameUI(
  gl:     WebGL2RenderingContext,
  width:  number,
  height: number,
): Promise<PixiGameUI> {
  const renderer = new WebGLRenderer()
  await renderer.init({
    context:           gl,
    width,
    height,
    backgroundAlpha:   0,
    clearBeforeRender: false,
  } as any)

  const stage          = new Container()
  const gameContainer  = new Container()
  const shellContainer = new Container()
  stage.addChild(gameContainer, shellContainer)

  return {
    gameContainer,
    shellContainer,
    render(gl: WebGL2RenderingContext, w: number, h: number) {
      // Remet le GPU dans l'état attendu par PixiJS après le rendu Babylon
      gl.disable(gl.SCISSOR_TEST)
      gl.disable(gl.STENCIL_TEST)
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.colorMask(true, true, true, true)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.bindVertexArray(null)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // premultiplied alpha (PixiJS v8)
      gl.viewport(0, 0, w, h)

      // Invalide les caches JS de PixiJS qui pointent vers l'état laissé par Babylon
      const r = renderer as any
      r.shader?.resetState?.()
      r.geometry?.resetState?.()
      r.texture?.resetState?.()
      r.state?.resetState?.()
      r.buffer?.resetState?.()
      r.stencil?.resetState?.()

      renderer.render({ container: stage, clear: false })

      // Délie le VAO PixiJS — empêche Babylon de corrompre ses vertex attrib enables
      // via wipeCaches(true) ou son propre rendu pendant que ce VAO est encore bindé.
      gl.bindVertexArray(null)
    },
    destroy: () => renderer.destroy(),
  }
}
