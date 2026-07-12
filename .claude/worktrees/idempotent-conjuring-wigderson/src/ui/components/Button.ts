import { Container, Graphics, Text, TextStyle } from 'pixi.js'

export class Button extends Container {
  private _bg: Graphics

  constructor(label: string, onClick: () => void) {
    super()

    this._bg = new Graphics()
      .roundRect(0, 0, 120, 40, 8)
      .fill({ color: 0x1a1a2e, alpha: 0.85 })
      .stroke({ color: 0x4a9eff, width: 1.5 })

    const text = new Text({
      text:  label,
      style: new TextStyle({ fill: 0xffffff, fontSize: 14, fontFamily: 'sans-serif' }),
    })
    text.anchor.set(0.5)
    text.position.set(60, 20)

    this.addChild(this._bg, text)

    this.eventMode = 'static'
    this.cursor    = 'pointer'
    this.on('pointerup', onClick)
    this.on('pointerover', () => this._bg.tint = 0xaaccff)
    this.on('pointerout',  () => this._bg.tint = 0xffffff)
  }
}
