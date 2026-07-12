import { UIScreen } from '../UIScreen';

/** In-game HUD — currently a placeholder. Lives in `gameUI` so it is captured into the freeze texture on pause. */
export class InGameScreen extends UIScreen {
  readonly layer = 'gameUI' as const;

  constructor(width: number, height: number) {
    super(width, height);
  }

  protected _onResize(_w: number, _h: number): void {
    // no children yet
  }
}
