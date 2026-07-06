import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { UIComponent } from '../UIComponent';

const PAD_X = 32;
const PAD_Y = 18;

/**
 * Visuel d'un toast unique — carte sombre arrondie autodimensionnée sur son texte, même
 * langage visuel que la sheet de pairing (`PairingOverlayScreen`). Positionnée manuellement
 * par `ToastPanel` (pas de layout Yoga : la carte vit sur la couche notifications, hors flux).
 */
export class ToastCard extends UIComponent {
  readonly node: Container;
  readonly widthPx: number;
  readonly heightPx: number;

  /** @param message - Texte du toast, affiché en majuscules. */
  constructor(message: string) {
    super();
    this.node = new Container();

    const label = new Text({
      text: message.toUpperCase(),
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 20,
        fontFamily: 'fezbox',
        letterSpacing: 2,
      }),
    });

    // `Text` mesure synchroniquement — le fond est dimensionné d'après lui (même pattern que
    // le chip de PairingPanel).
    this.widthPx = label.width + PAD_X * 2;
    this.heightPx = label.height + PAD_Y * 2;

    const bg = new Graphics()
      .roundRect(0, 0, this.widthPx, this.heightPx, 14)
      .fill({ color: 0x0c0c0f, alpha: 0.97 })
      .stroke({ color: 0x2a2a2e, width: 1.5 });
    label.position.set(PAD_X, PAD_Y);

    this.node.addChild(bg, label);
  }
}
