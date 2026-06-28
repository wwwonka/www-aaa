import { Engine, Scene }         from '@babylonjs/core'
import { Graphics }               from 'pixi.js'
import { sceneSetup }             from './scene/sceneSetup'
import { createPixiGameUI }       from './layers/pixiGameUI'
import type { PixiGameUI }        from './layers/pixiGameUI'
import { startRenderLoop }        from './renderLoop'

export class RenderManager {
  private _canvas!:        OffscreenCanvas
  private _engine!:        Engine
  private _scene!:         Scene
  private _gl!:            WebGL2RenderingContext
  private _gameUI!:        PixiGameUI
  private _width!:         number
  private _height!:        number
  private _targetFps!:     number
  private _stopLoop!:      () => void

  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
    this._canvas = canvas
    this._width  = canvas.width  || 800
    this._height = canvas.height || 600

    this._engine = new Engine(canvas, true, {
      deterministicLockstep: false,
      preserveDrawingBuffer: true,
      stencil:               true,
    })
    this._scene = new Scene(this._engine)

    // Contexte pris depuis Babylon — garantit le même objet GL qu'il utilise en interne
    this._gl = (this._engine as any)._gl as WebGL2RenderingContext

    this._gameUI = await createPixiGameUI(this._gl, this._width, this._height)

    await this._setupScene()
    this._targetFps = targetFps
    this._stopLoop  = startRenderLoop(() => this._frame(), targetFps)
    this._listenMessages()
  }

  // Resize et visibility arrivent du main thread via postMessage (pas de window dans le worker)
  private _listenMessages(): void {
    self.addEventListener('message', (e) => {
      if (e.data?.type === 'resize') {
        const { width: w, height: h } = e.data
        this._canvas.width  = w
        this._canvas.height = h
        this._width         = w
        this._height        = h
        this._engine.resize()
        this._gameUI.resize(w, h)
        // Re-rendu immédiat — browser ne peut composer qu'après que JS yield,
        // donc il ne verra jamais le buffer effacé ni l'ancien buffer stretchée
        this._frame()
      }
      if (e.data?.type === 'visibility') {
        e.data.hidden ? this._stopLoop() : this._restartLoop()
      }
    })
  }

  private _restartLoop(): void {
    this._stopLoop = startRenderLoop(() => this._frame(), this._targetFps)
  }

  private async _setupScene(): Promise<void> {
    sceneSetup(this._engine, this._scene)

    // Rectangle de debug — à retirer une fois le rendu PixiJS stabilisé
    const debug = new Graphics().rect(50, 50, 120, 40).fill(0xff0000)
    this._gameUI.gameContainer.addChild(debug)
  }

  private _frame(): void {
    this._scene.render()
    this._gameUI.render(this._gl, this._width, this._height)
    this._engine.wipeCaches(true)
  }

  setFps(fps: number): void {
    this._targetFps = fps
    this._stopLoop()
    this._stopLoop = startRenderLoop(() => this._frame(), fps)
  }

  dispose(): void {
    this._stopLoop()
    this._gameUI.destroy()
    this._engine.dispose()
  }
}
