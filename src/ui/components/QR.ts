import { Container, Graphics } from 'pixi.js';
import { create as createQrModel } from 'qrcode';
import { UIComponent } from '../UIComponent';

interface QROptions {
  /** Texte encodé — typiquement `` `${pageOrigin}/?controller` `` (fourni par le main thread). */
  readonly text: string;
  /** Côté total de la carte (fond blanc inclus), en pixels. */
  readonly sizePx?: number;
}

const CARD_RADIUS_RATIO = 0.06;
/** Marge blanche autour des modules — la spec QR exige >= 4 modules de quiet zone. */
const QUIET_ZONE_MODULES = 4;

/**
 * Carte QR code : matrice calculée par `qrcode` (aucun DOM/canvas — utilisable dans le render
 * worker), modules dessinés une seule fois en `Graphics` sur fond blanc arrondi. Aucun redraw
 * après construction (zéro alloc en boucle de rendu).
 */
export class QR extends UIComponent {
  readonly node: Container;

  /** @param options - See {@link QROptions}. */
  constructor({ text, sizePx = 280 }: QROptions) {
    super();

    this.node = new Container();
    this.node.layout = { width: sizePx, height: sizePx };

    // Niveau 'M' (~15% de redondance) — suffisant pour un écran, garde la matrice petite donc
    // des modules plus gros, plus faciles à scanner qu'un niveau 'H' surdimensionné.
    const { modules } = createQrModel(text, { errorCorrectionLevel: 'M' });
    const moduleCount = modules.size + QUIET_ZONE_MODULES * 2;
    const modulePx = sizePx / moduleCount;
    const offsetPx = QUIET_ZONE_MODULES * modulePx;

    const graphics = new Graphics().roundRect(0, 0, sizePx, sizePx, sizePx * CARD_RADIUS_RATIO);
    graphics.fill({ color: 0xffffff });

    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (!modules.get(row, col)) continue;
        graphics.rect(offsetPx + col * modulePx, offsetPx + row * modulePx, modulePx, modulePx);
      }
    }
    graphics.fill({ color: 0x000000 });

    this.node.addChild(graphics);
  }
}
