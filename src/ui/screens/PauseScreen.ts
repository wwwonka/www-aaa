import { UIScreen }        from '../UIScreen'
import { PauseMenuPanel }  from '../panels/PauseMenuPanel'
import { resolvePosition, Anchor } from '../layout'
import type { AppEvent }   from '../../core/AppOrchestrator'

type SendFn = (event: AppEvent) => void

/** Overlay shown while `IN_GAME` is paused — centers a `PauseMenuPanel`. */
export class PauseScreen extends UIScreen {
  readonly layer = 'overlayUI' as const

  private readonly _panel: PauseMenuPanel

  /** @param send - Dispatches `RESUME`/`QUIT` back to the app state machine. */
  constructor(send: SendFn, width: number, height: number) {
    super(width, height)

    this._panel = new PauseMenuPanel(
      () => send({ type: 'RESUME' }),
      () => send({ type: 'QUIT'   }),
    )
    this.node.addChild(this._panel.node)
    this.onResize(width, height)
  }

  protected onResize(w: number, h: number): void {
    const { x, y } = resolvePosition({ nx: 0.5, ny: 0.5 }, Anchor.CENTER, w, h)
    this._panel.node.position.set(x, y)
  }
}
