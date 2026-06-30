import { UIScreen }        from '../UIScreen'
import { PauseMenuPanel }  from '../panels/PauseMenuPanel'
import { resolvePosition, Anchor } from '../layout'
import type { AppEvent }   from '../../core/AppStateMachine'

type SendFn = (event: AppEvent) => void

export class PauseScreen extends UIScreen {
  readonly layer = 'overlayUI' as const

  private readonly _panel: PauseMenuPanel

  constructor(send: SendFn, width: number, height: number) {
    super(width, height)

    this._panel = new PauseMenuPanel(
      () => send({ type: 'RESUME' }),
      () => send({ type: 'QUIT'   }),
    )
    this.addChild(this._panel)
    this.onResize(width, height)
  }

  protected onResize(w: number, h: number): void {
    const { x, y } = resolvePosition({ nx: 0.5, ny: 0.5 }, Anchor.CENTER, w, h)
    this._panel.position.set(x, y)
  }
}
