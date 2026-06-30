import { Text, TextStyle } from 'pixi.js'
import { UIScreen }        from '../UIScreen'
import { resolvePosition, Anchor } from '../layout'

export class TitleScreen extends UIScreen {
  readonly layer = 'overlayUI' as const

  private readonly _label: Text

  constructor(width: number, height: number) {
    super(width, height)

    this._label = new Text({
      text:  'Press SPACE to play',
      style: new TextStyle({ fill: 0xffffff, fontSize: 24, fontFamily: 'sans-serif' }),
    })
    this._label.anchor.set(0.5)
    this.addChild(this._label)
    this.onResize(width, height)
  }

  protected onResize(w: number, h: number): void {
    const { x, y } = resolvePosition({ nx: 0.5, ny: 0.6 }, Anchor.CENTER, w, h)
    this._label.position.set(x, y)
  }
}
