import { Container } from 'pixi.js'
import { UIComponent } from '../UIComponent'
import { TextLabel } from '../components/TextLabel'
import { loadFont } from '../../render/assets/loadAsset'

/** Title text + "connect controller" prompt, both independently animatable (see `TextLabel`'s `animatableId`). */
export class TitleMenuPanel extends UIComponent {
  readonly node: Container

  private constructor(onConnectController: () => void) {
    super()

    this.node = new Container()
    this.node.layout = {
      flexDirection: 'column',
      alignItems:    'center',
      justifyContent: 'center',
      gap:           60,
    }

    const title = new TextLabel({
      text:  'TITLE\nSCREEN',
      style: {
        fill:          0xffffff,
        fontSize:      270,
        fontFamily:    'fezbox',
        align:         'center',
        letterSpacing: 4,
      },
      animatableId: 'title',
    })

    const connectController = new TextLabel({
      text:  'CONNECT CONTROLLER',
      style: {
        fill:          0xaaaaaa,
        fontSize:      30,
        fontFamily:    'fezbox',
        align:         'center',
        letterSpacing: 2,
      },
      onClick:      onConnectController,
      animatableId: 'connectController',
    })

    this.node.addChild(title.node, connectController.node)
  }

  /**
   * Loads and registers fezbox into this Worker's `FontFaceSet` before any `TextLabel` using it is constructed.
   *
   * @param onConnectController - Click handler for the "connect controller" prompt.
   */
  static async create(onConnectController: () => void): Promise<TitleMenuPanel> {
    const face = await loadFont('fezbox.otf')
    ;(self as unknown as WorkerGlobalScope & {
      fonts: FontFaceSet
    }).fonts.add(face)
    return new TitleMenuPanel(onConnectController)
  }
}
