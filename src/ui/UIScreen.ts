import { Container } from 'pixi.js';
import '@pixi/layout';
import type { LayoutStyles } from '@pixi/layout';
import { easeIn, easeOut } from './layout';

type TweenDir = 'in' | 'out';

/**
 * Base class for all top-level UI screens.
 *
 * Composition, not inheritance: a screen owns `.node` (the actual Pixi `Container` added to a
 * layer) rather than being one itself — consistent with `UIComponent` across `ui/`.
 *
 * Lifecycle:
 *   - Created once, permanently attached to its layer (alpha=0, no interactions)
 *   - `onEnter` fades it in and enables hit-testing
 *   - `onLeave` disables hit-testing immediately and fades out
 *   - `update(delta)` must be called every frame by `ScreenManager`
 */
export abstract class UIScreen {
  readonly node: Container = new Container();

  /** Which PixiJS layer this screen lives in */
  abstract readonly layer: 'gameUI' | 'overlayUI';

  /**
   * Overlay screens (e.g. pairing modal) render on top of the current base screen without
   * fading it out — see `ScreenManager.transition` for the exact semantics.
   */
  readonly isOverlay: boolean = false;

  protected _width: number;
  protected _height: number;

  private _tweenDir: TweenDir | null = null;
  private _tweenElapsed: number = 0;
  private _tweenDuration: number = 0;

  // `node.layout` (l'accesseur de @pixi/layout) renvoie le nœud Yoga vivant, pas la config qu'on
  // lui a passée — il porte ses propres refs internes (context/target) qui se referencent
  // circulairement. On garde notre propre copie plate pour pouvoir la reconstruire au resize sans
  // jamais relire/spreader `node.layout`.
  private _layoutStyle: LayoutStyles;

  constructor(width: number, height: number) {
    this._width = width;
    this._height = height;
    this.node.alpha = 0;
    this.node.eventMode = 'none';
    this._layoutStyle = { width, height, justifyContent: 'center', alignItems: 'center' };
    this.node.layout = this._layoutStyle;
  }

  /**
   * Fade in and enable interactions. Subclasses with bespoke reveal behavior (e.g. `TitleScreen`,
   * whose subcomponents animate their own opacity via `AnimationRegistry`) override this entirely
   * without calling `super.onEnter()` — this base implementation is the default tween only, not a
   * lifecycle hook that always runs.
   *
   * @param duration - Fade-in duration in milliseconds.
   */
  onEnter(duration = 250): void {
    this._tweenDir = 'in';
    this._tweenElapsed = 0;
    this._tweenDuration = duration;
    this.node.eventMode = 'passive';
  }

  /**
   * Disable interactions immediately, then fade out.
   *
   * @param duration - Fade-out duration in milliseconds.
   */
  onLeave(duration = 250): void {
    this._tweenDir = 'out';
    this._tweenElapsed = 0;
    this._tweenDuration = duration;
    this.node.eventMode = 'none';
  }

  /**
   * Called every frame by `ScreenManager`.
   *
   * @param delta - Elapsed time since the last frame, in milliseconds.
   */
  update(delta: number): void {
    if (this._tweenDir === null) return;
    this._tweenElapsed += delta;
    const t = Math.min(this._tweenElapsed / this._tweenDuration, 1);
    this.node.alpha = this._tweenDir === 'in' ? easeOut(t) : 1 - easeIn(t);
    if (t >= 1) this._tweenDir = null;
  }

  /**
   * Propagate resize from `ScreenManager` — implement `_onResize` in subclasses.
   *
   * @param width - New viewport width, in pixels.
   * @param height - New viewport height, in pixels.
   */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._layoutStyle = { ...this._layoutStyle, width, height };
    this.node.layout = this._layoutStyle;
    this._onResize(width, height);
  }

  /** Reposition children after a resize. */
  protected abstract _onResize(width: number, height: number): void;
}
