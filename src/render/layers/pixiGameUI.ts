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
      // Caps que renderer.resetState() ne couvre pas
      gl.disable(gl.SCISSOR_TEST)
      gl.disable(gl.STENCIL_TEST)
      gl.colorMask(true, true, true, true)
      gl.viewport(0, 0, w, h)

      // Remet tous les caches JS PixiJS + l'état GL standard (blend, depth, vao…)
      renderer.resetState()

      renderer.render({ container: stage, clear: false })

      // Délie le VAO — empêche Babylon de corrompre ses vertex attrib enables
      gl.bindVertexArray(null)
    },
    destroy: () => renderer.destroy(),
  }
}
