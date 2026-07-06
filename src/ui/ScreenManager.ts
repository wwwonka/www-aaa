import type { Container } from 'pixi.js';
import type { AppState } from '../core/AppOrchestrator';
import type { UIScreen } from './UIScreen';

interface ScreenEntry {
  readonly screen: UIScreen;
  readonly layer: Container;
}

/**
 * Maps `AppState` values to `UIScreen` instances and drives their lifecycle.
 *
 * Screens are permanently attached to their layer at `register()` time (alpha=0,
 * no interactions). Transitions fade out the current screen and fade in the next
 * without any `addChild`/`removeChild` churn.
 */
export class ScreenManager {
  private readonly _map: Map<AppState, ScreenEntry> = new Map();
  private _current: AppState | null = null;

  private readonly _gameUI: Container;
  private readonly _overlayUI: Container;

  constructor(gameUI: Container, overlayUI: Container) {
    this._gameUI = gameUI;
    this._overlayUI = overlayUI;
  }

  /**
   * Register a screen for a given app state.
   * The screen is immediately added to its layer at alpha=0 with no interactions.
   *
   * @param state - The `AppState` this screen should be shown for.
   * @param screen - The screen instance to register.
   */
  register(state: AppState, screen: UIScreen): void {
    const layer = screen.layer === 'gameUI' ? this._gameUI : this._overlayUI;
    layer.addChild(screen.node);
    this._map.set(state, { screen, layer });
  }

  /**
   * Transition to a new state: fade out the current screen, fade in the next.
   * Side-effects (blur, etc.) should be handled by the caller before invoking this.
   *
   * @param to - The `AppState` to transition to.
   */
  transition(to: AppState): void {
    if (this._current !== null) {
      this._map.get(this._current)?.screen.onLeave();
    }
    this._map.get(to)?.screen.onEnter();
    this._current = to;
  }

  /**
   * Re-invokes `onEnter()` on the currently displayed screen — used to restart its animation
   * (idempotent) after an external pause (Theatre.js Authoring mode), without going through a
   * real transition and without the caller needing to know any animation id.
   */
  replayCurrentReveal(): void {
    if (this._current !== null) this._map.get(this._current)?.screen.onEnter();
  }

  /**
   * Forward per-frame delta to all registered screens.
   *
   * @param delta - Elapsed time since the last frame, in milliseconds.
   */
  update(delta: number): void {
    for (const { screen } of this._map.values()) screen.update(delta);
  }

  /**
   * Forward resize to all registered screens.
   *
   * @param width - New viewport width, in pixels.
   * @param height - New viewport height, in pixels.
   */
  resize(width: number, height: number): void {
    for (const { screen } of this._map.values()) screen.resize(width, height);
  }
}
