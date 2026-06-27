import { Engine, Scene }         from '@babylonjs/core'
import { Graphics }               from 'pixi.js'
import { sceneSetup }             from './scene/sceneSetup'
import { createPixiGameUI }       from './layers/pixiGameUI'
import type { PixiGameUI }        from './layers/pixiGameUI'
import { startRenderLoop }        from './renderLoop'

export class RenderManager {
  private _engine!:   Engine
  private _scene!:    Scene
  private _gl!:       WebGL2RenderingContext
  private _gameUI!:   PixiGameUI
  private _width!:    number
  private _height!:   number
  private _stopLoop!: () => void

  async init(canvas: OffscreenCanvas, targetFps = 60): Promise<void> {
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
    this._stopLoop = startRenderLoop(() => this._frame(), targetFps)
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
    this._stopLoop()
    this._stopLoop = startRenderLoop(() => this._frame(), fps)
  }

  dispose(): void {
    this._stopLoop()
    this._gameUI.destroy()
    this._engine.dispose()
  }
}
