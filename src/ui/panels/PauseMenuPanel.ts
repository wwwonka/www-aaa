import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { Button } from '../components/Button'

const PANEL_W = 280
const PANEL_H = 200
const RADIUS  = 16

export class PauseMenuPanel extends Container {
  constructor(
    onResume: () => void,
    onQuit:   () => void,
  ) {
    super()

    // Dark frosted background card
    const bg = new Graphics()
      .roundRect(-PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, RADIUS)
      .fill({ color: 0x0d0d1a, alpha: 0.88 })
      .stroke({ color: 0x334466, width: 1.5 })
    this.addChild(bg)

    // Title
    const title = new Text({
      text:  'PAUSED',
      style: new TextStyle({
        fill:       0xffffff,
        fontSize:   28,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        letterSpacing: 4,
      }),
    })
    title.anchor.set(0.5)
    title.position.set(0, -PANEL_H / 2 + 44)
    this.addChild(title)

    // Separator line
    const sep = new Graphics()
      .moveTo(-PANEL_W / 2 + 24, -PANEL_H / 2 + 72)
      .lineTo( PANEL_W / 2 - 24, -PANEL_H / 2 + 72)
      .stroke({ color: 0x334466, width: 1 })
    this.addChild(sep)

    // Buttons — centered horizontally
    const resumeBtn = new Button('Resume', onResume)
    resumeBtn.position.set(-PANEL_W / 2 + (PANEL_W - 120) / 2, -PANEL_H / 2 + 90)
    this.addChild(resumeBtn)

    const quitBtn = new Button('Quit to title', onQuit)
    quitBtn.position.set(-PANEL_W / 2 + (PANEL_W - 120) / 2, -PANEL_H / 2 + 142)
    this.addChild(quitBtn)
  }
}
