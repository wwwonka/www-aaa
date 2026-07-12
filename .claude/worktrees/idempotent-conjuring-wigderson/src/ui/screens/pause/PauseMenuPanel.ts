import { Container, Text, TextStyle } from 'pixi.js'
import { Button } from '../../components/Button'

export class PauseMenuPanel extends Container {
  constructor(
    onResume: () => void,
    onQuit:   () => void,
  ) {
    super()

    const title = new Text({
      text:  'PAUSED',
      style: new TextStyle({ fill: 0xffffff, fontSize: 32, fontFamily: 'sans-serif', fontWeight: 'bold' }),
    })
    title.anchor.set(0.5, 0)
    title.position.set(0, 0)

    const resumeBtn = new Button('Resume', onResume)
    resumeBtn.position.set(-60, 60)

    const quitBtn = new Button('Quit', onQuit)
    quitBtn.position.set(-60, 110)

    this.addChild(title, resumeBtn, quitBtn)
  }
}
