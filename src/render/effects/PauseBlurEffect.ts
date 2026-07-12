import type { FrozenGameLayer } from '../layers/layer2_frozenGame';
import { easeIn, easeOut } from '../../ui/layout';

/**
 * Blur transition state: `'normal'` (not active), `'pausing'`/`'resuming'` (strength ramping),
 * `'frozen'` (fully blurred, holding at {@link MAX_STRENGTH} while paused).
 */
type RenderMode = 'normal' | 'pausing' | 'frozen' | 'resuming';

const PAUSE_DURATION = 350;
const RESUME_DURATION = 350;
const MAX_STRENGTH = 12;

/**
 * Drives the pause-screen blur transition: freezes the game frame into {@link FrozenGameLayer} and
 * ramps a blur strength in/out over {@link PAUSE_DURATION}/{@link RESUME_DURATION} ms.
 */
export class PauseBlurEffect {
  private _frozen: FrozenGameLayer;
  private _gl: WebGL2RenderingContext;
  private _width: () => number;
  private _height: () => number;
  private _mode: RenderMode = 'normal';
  private _elapsed: number = 0;
  private _strength: number = 0;

  constructor(
    frozen: FrozenGameLayer,
    gl: WebGL2RenderingContext,
    width: () => number,
    height: () => number,
  ) {
    this._frozen = frozen;
    this._gl = gl;
    this._width = width;
    this._height = height;
  }

  get mode(): RenderMode {
    return this._mode;
  }
  get isActive(): boolean {
    return this._mode !== 'normal';
  }

  /** Captures the current frame into {@link FrozenGameLayer} and starts the pausing (blur-in) transition. */
  enter(): void {
    if (this.isActive) this._frozen.deactivate();
    this._frozen.activate(this._gl, this._width(), this._height());
    this._elapsed = 0;
    this._mode = 'pausing';
  }

  /** Starts the resuming (blur-out) transition; the frozen frame is released once it completes. */
  exit(): void {
    this._elapsed = 0;
    this._mode = 'resuming';
  }

  /** Advances the current transition by `delta` ms. No-op when `'normal'` or `'frozen'`. */
  update(delta: number): void {
    if (this._mode === 'normal' || this._mode === 'frozen') return;

    this._elapsed += delta;

    if (this._mode === 'pausing') {
      const t = Math.min(this._elapsed / PAUSE_DURATION, 1);
      this._strength = easeOut(t) * MAX_STRENGTH;
      this._frozen.setStrength(this._strength);
      if (t >= 1) this._mode = 'frozen';
    }

    if (this._mode === 'resuming') {
      const t = Math.min(this._elapsed / RESUME_DURATION, 1);
      this._strength = (1 - easeIn(t)) * MAX_STRENGTH;
      this._frozen.setStrength(this._strength);
      if (t >= 1) {
        this._frozen.deactivate();
        this._mode = 'normal';
      }
    }
  }

  /** Re-captures the frozen frame at the new dimensions, preserving the current blur strength. No-op when not active. */
  resize(width: number, height: number): void {
    if (this.isActive) {
      this._frozen.deactivate();
      this._frozen.activate(this._gl, width, height);
      this._frozen.setStrength(this._strength);
    }
  }
}
