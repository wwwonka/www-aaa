import { UIScreen } from '../UIScreen';
import { TextLabel } from '../components/TextLabel';
import { loadFont } from '../../render/assets/loadAsset';
import { registerFontFace } from '../registerFontFace';

/**
 * Écran receiver pendant que le jeu vit sur le phone (`PLAYING_ON_PHONE`, flow CLAUDE.md §10).
 * La scène de jeu locale est masquée mais jamais détruite (§B.1) — « BRING IT BACK » demande
 * le retour d'autorité (même protocole que PLAY HERE, la FSM est symétrique).
 */
export class PlayingOnPhoneScreen extends UIScreen {
  readonly layer = 'overlayUI' as const;

  private readonly _title: TextLabel;
  private readonly _bringBack: TextLabel;

  private constructor(width: number, height: number, onBringBack: () => void) {
    super(width, height);

    this._title = new TextLabel({
      text: 'PLAYING ON PHONE',
      style: {
        fill: 0xffffff,
        fontSize: 44,
        fontFamily: 'fezbox',
        align: 'center',
        letterSpacing: 6,
      },
    });

    this._bringBack = new TextLabel({
      text: 'BRING IT BACK',
      style: {
        fill: 0xffffff,
        fontSize: 24,
        fontFamily: 'fezbox',
        align: 'center',
        letterSpacing: 4,
      },
      onClick: onBringBack,
    });

    // Hors flux Yoga (le root de UIScreen centre ses enfants layoutés) : positions manuelles.
    this._title.node.layout = null;
    this._bringBack.node.layout = null;

    this.node.addChild(this._title.node, this._bringBack.node);
    this._layout();
  }

  /** @param onBringBack - Demande le retour du jeu (`REQUEST_HANDOFF`, intercepté par AppHost). */
  static async create(
    width: number,
    height: number,
    onBringBack: () => void,
  ): Promise<PlayingOnPhoneScreen> {
    const face = await loadFont('fezbox.otf');
    registerFontFace(face);
    return new PlayingOnPhoneScreen(width, height, onBringBack);
  }

  protected _onResize(): void {
    this._layout();
  }

  private _layout(): void {
    this._title.node.position.set(
      this._width * 0.5 - this._title.node.width * 0.5,
      this._height * 0.42,
    );
    this._bringBack.node.position.set(
      this._width * 0.5 - this._bringBack.node.width * 0.5,
      this._height * 0.42 + this._title.node.height + 32,
    );
  }
}
