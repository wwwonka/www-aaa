import { Container } from 'pixi.js'
import { easeIn, easeOut } from './layout'

type TweenDir = 'in' | 'out'

/**
 * Base class for all top-level UI screens.
 *
 * Extends `Container` directly so `ScreenManager` can `addChild(screen)` on
 * a layer without any `.container` indirection.
 *
 * Lifecycle:
 *   - Created once, permanently attached to its layer (alpha=0, no interactions)
 *   - `onEnter` fades it in and enables hit-testing
 *   - `onLeave` disables hit-testing immediately and fades out
 *   - `update(delta)` must be called every frame by `ScreenManager`
 */
export abstract class UIScreen extends Container {
  /** Which PixiJS layer this screen lives in */
  abstract readonly layer: 'gameUI' | 'overlayUI'

  protected _width:  number
  protected _height: number

  private _tweenDir:      TweenDir | null = null
  private _tweenElapsed:  number = 0
  private _tweenDuration: number = 0

  constructor(width: number, height: number) {
    super()
    this._width     = width
    this._height    = height
    this.alpha      = 0
    this.eventMode  = 'none'
  }

  /** Fade in and enable interactions. */
  onEnter(duration = 250): void {
    this._tweenDir      = 'in'
    this._tweenElapsed  = 0
    this._tweenDuration = duration
    this.eventMode      = 'passive'
  }

  /** Disable interactions immediately, then fade out. */
  onLeave(duration = 250): void {
    this._tweenDir      = 'out'
    this._tweenElapsed  = 0
    this._tweenDuration = duration
    this.eventMode      = 'none'
  }

  /** Called every frame by `ScreenManager`. */
  update(delta: number): void {
    if (this._tweenDir === null) return
    this._tweenElapsed += delta
    const t = Math.min(this._tweenElapsed / this._tweenDuration, 1)
    this.alpha = this._tweenDir === 'in' ? easeOut(t) : 1 - easeIn(t)
    if (t >= 1) this._tweenDir = null
  }

  /** Propagate resize from `ScreenManager` — implement `onResize` in subclasses. */
  resize(width: number, height: number): void {
    this._width  = width
    this._height = height
    this.onResize(width, height)
  }

  /** Reposition children after a resize. */
  protected abstract onResize(width: number, height: number): void
}
