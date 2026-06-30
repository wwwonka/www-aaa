import type { FrozenGameLayer } from '../layers/layer2_frozenGame'
import { easeIn, easeOut }     from '../../ui/layout'

type RenderMode = 'normal' | 'pausing' | 'frozen' | 'resuming'

const PAUSE_DURATION  = 350
const RESUME_DURATION = 350
const MAX_STRENGTH    = 12

export class PauseBlurEffect {
  private _frozen:   FrozenGameLayer
  private _gl:       WebGL2RenderingContext
  private _width:    () => number
  private _height:   () => number
  private _mode:     RenderMode = 'normal'
  private _elapsed:  number     = 0
  private _strength: number     = 0

  constructor(
    frozen: FrozenGameLayer,
    gl:     WebGL2RenderingContext,
    width:  () => number,
    height: () => number,
  ) {
    this._frozen = frozen
    this._gl     = gl
    this._width  = width
    this._height = height
  }

  get mode(): RenderMode  { return this._mode }
  get isActive(): boolean { return this._mode !== 'normal' }

  enter(): void {
    if (this.isActive) this._frozen.deactivate()
    this._frozen.activate(this._gl, this._width(), this._height())
    this._elapsed = 0
    this._mode    = 'pausing'
  }

  exit(): void {
    this._elapsed = 0
    this._mode    = 'resuming'
  }

  update(delta: number): void {
    if (this._mode === 'normal' || this._mode === 'frozen') return

    this._elapsed += delta

    if (this._mode === 'pausing') {
      const t = Math.min(this._elapsed / PAUSE_DURATION, 1)
      this._strength = easeOut(t) * MAX_STRENGTH
      this._frozen.setStrength(this._strength)
      if (t >= 1) this._mode = 'frozen'
    }

    if (this._mode === 'resuming') {
      const t = Math.min(this._elapsed / RESUME_DURATION, 1)
      this._strength = (1 - easeIn(t)) * MAX_STRENGTH
      this._frozen.setStrength(this._strength)
      if (t >= 1) {
        this._frozen.deactivate()
        this._mode = 'normal'
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.isActive) {
      this._frozen.deactivate()
      this._frozen.activate(this._gl, width, height)
      this._frozen.setStrength(this._strength)
    }
  }
}
