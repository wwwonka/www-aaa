import { Container, Text, TextStyle } from 'pixi.js'

export interface FrameStats { fps: number; frameMs: number }

const STYLE = new TextStyle({
  fontFamily: 'monospace',
  fontSize:   13,
  fill:       0x00ff88,
  dropShadow: { color: 0x000000, blur: 3, distance: 1 } as any,
})

export class DebugOverlay {
  readonly container: Container
  private _text: Text

  constructor() {
    this._text     = new Text({ text: '', style: STYLE })
    this._text.x   = 12
    this._text.y   = 12
    this.container = new Container()
    this.container.addChild(this._text)
    this.container.visible = false
  }

  update(stats: FrameStats): void {
    if (!this.container.visible) return
    this._text.text = [
      `FPS       ${stats.fps.toFixed(1)}`,
      `frame     ${stats.frameMs.toFixed(2)} ms`,
    ].join('\n')
  }

  toggle(): void {
    this.container.visible = !this.container.visible
  }
}
