import { Graphics } from 'pixi.js';
import { UIScreen } from '../UIScreen';
import { TextLabel } from '../components/TextLabel';
import { loadFont } from '../../render/assets/loadAsset';

/**
 * Écran de base du device controller (enregistré pour `TITLE_SCREEN` à la place de
 * `TitleScreen` quand `role === 'controller'`) : fond noir + bouton START. La zone restante
 * accueillera les joysticks à l'Étape 5. START envoie `PLAY` — le main le propage aussi au
 * receiver via le canal de pairing (voir `AppHost`).
 */
export class GamepadScreen extends UIScreen {
  readonly layer = 'overlayUI' as const;

  private readonly _bg: Graphics = new Graphics();

  private constructor(width: number, height: number, onPlay: () => void) {
    super(width, height);

    // Fond hors layout Yoga (position manuelle, comme le backdrop de PairingOverlayScreen).
    this._redrawBg();

    const start = new TextLabel({
      text: 'START',
      style: {
        fill: 0xffffff,
        fontSize: 52,
        fontFamily: 'fezbox',
        align: 'center',
        letterSpacing: 6,
      },
      onClick: onPlay,
    });

    this.node.addChild(this._bg, start.node);
  }

  /**
   * Charge fezbox dans le `FontFaceSet` du worker avant le premier label (même pattern que `TitleMenuPanel`).
   *
   * @param onPlay - Click handler du bouton START — remonte `PLAY` à l'orchestrateur.
   */
  static async create(width: number, height: number, onPlay: () => void): Promise<GamepadScreen> {
    const face = await loadFont('fezbox.otf');
    (self as unknown as WorkerGlobalScope & { fonts: FontFaceSet }).fonts.add(face);
    return new GamepadScreen(width, height, onPlay);
  }

  protected _onResize(): void {
    this._redrawBg();
  }

  private _redrawBg(): void {
    this._bg.clear().rect(0, 0, this._width, this._height).fill({ color: 0x000000 });
  }
}
