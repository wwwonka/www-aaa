import { Container }     from 'pixi.js'
import { PauseMenuPanel } from './PauseMenuPanel'
import type { AppEvent }  from '../../../core/AppStateMachine'

type SendFn = (event: AppEvent) => void

export class PauseScreen {
  readonly container: Container
  private _send:   SendFn
  private _width:  number
  private _height: number

  constructor(send: SendFn, width: number, height: number) {
    this._send   = send
    this._width  = width
    this._height = height

    this.container = new Container()
    const panel = new PauseMenuPanel(
      () => this._send({ type: 'RESUME' }),
      () => this._send({ type: 'QUIT' }),
    )
    panel.position.set(this._width / 2, this._height / 2 - 60)
    this.container.addChild(panel)
  }

  resize(width: number, height: number): void {
    this._width  = width
    this._height = height
    if (this.container.children[0]) {
      this.container.children[0].position.set(width / 2, height / 2 - 60)
    }
  }
}
