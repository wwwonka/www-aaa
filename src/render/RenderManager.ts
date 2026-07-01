import { Engine, Scene, Color4, RegisterStandardEngineExtensions } from '@babylonjs/core/pure'

RegisterStandardEngineExtensions()
import { sceneSetup }           from './scene/sceneSetup'
import { createUIRenderer }     from './layers/uiRenderer'
import type { UIRenderer }      from './layers/uiRenderer'
import { PauseBlurEffect }      from './effects/PauseBlurEffect'
import { ScreenManager }        from '../ui/ScreenManager'
import { PauseScreen }          from '../ui/screens/PauseScreen'
import { TitleScreen }          from '../ui/screens/TitleScreen'
import { InGameScreen }         from '../ui/screens/InGameScreen'
import { startRenderLoop }      from './renderLoop'
import type { AppState, AppEvent } from '../core/AppOrchestrator'

export class RenderManager {
  private _canvas!:         OffscreenCanvas
  private _engine!:         Engine
  private _scene!:          Scene
  private _gl!:             WebGL2RenderingContext
  private _ui!:             UIRenderer
  private _pauseBlur!:      PauseBlurEffect
  private _screenManager!:  ScreenManager
  private _width!:          number
  private _height!:         number
  private _targetFps!:      number
  private _stopLoop!:       () => void
  private _lastTime:        number = 0

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
    this._scene.clearColor = new Color4(0, 0, 0, 1)

    this._gl = (this._engine as any)._gl as WebGL2RenderingContext

    this._ui = await createUIRenderer(this._gl, this._width, this._height)

    this._pauseBlur = new PauseBlurEffect(
      this._ui.frozenGame,
      this._gl,
      () => this._width,
      () => this._height,
    )

    await this._setupScene()
    this._targetFps = targetFps
    this._stopLoop  = startRenderLoop((ts) => this._frame(ts), targetFps)
    this._listenMessages()
  }

  setSendToAsm(fn: (event: AppEvent) => void): void {
    this._screenManager = new ScreenManager(this._ui.gameUI, this._ui.overlayUI)

    this._screenManager.register('PAUSED',       new PauseScreen(fn, this._width, this._height))
    this._screenManager.register('TITLE_SCREEN', new TitleScreen(this._width, this._height))
    this._screenManager.register('IN_GAME',      new InGameScreen(this._width, this._height))
  }

  showScreen(state: AppState): void {
    if (state === 'PAUSED') {
      this._pauseBlur.enter()
    } else if (this._pauseBlur.isActive) {
      this._pauseBlur.exit()
    }
    this._screenManager?.transition(state)
  }

  setFps(fps: number): void {
    this._targetFps = fps
    this._stopLoop()
    this._stopLoop = startRenderLoop((ts) => this._frame(ts), fps)
  }

  dispose(): void {
    this._stopLoop()
    this._ui.destroy()
    this._engine.dispose()
  }

  private _listenMessages(): void {
    self.addEventListener('message', (e) => {
      if (e.data?.type === 'resize') {
        const { width: w, height: h } = e.data
        this._canvas.width  = w
        this._canvas.height = h
        this._width         = w
        this._height        = h
        this._engine.resize()
        this._ui.resize(w, h)
        this._pauseBlur.resize(w, h)
        this._screenManager?.resize(w, h)
        this._frame(performance.now())
      }
      if (e.data?.type === 'visibility') {
        e.data.hidden ? this._stopLoop() : this._restartLoop()
      }
    })
  }

  private _restartLoop(): void {
    this._stopLoop = startRenderLoop((ts) => this._frame(ts), this._targetFps)
  }

  private async _setupScene(): Promise<void> {
    await sceneSetup(this._engine, this._scene)
  }

  private _frame(ts: number): void {
    const delta    = this._lastTime ? ts - this._lastTime : 16
    this._lastTime = ts

    this._screenManager?.update(delta)

    if (this._pauseBlur.mode !== 'frozen') {
      this._scene.render()
    }

    this._pauseBlur.update(delta)

    if (this._pauseBlur.isActive) {
      const liveCapture = this._pauseBlur.mode === 'resuming'
      this._ui.renderSplit(this._gl, this._width, this._height, liveCapture)
    } else {
      this._ui.renderNormal(this._gl, this._width, this._height)
    }

    this._engine.wipeCaches(true)
  }
}
