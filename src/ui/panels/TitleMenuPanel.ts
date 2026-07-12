import { Container } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { TextLabel } from '../components/TextLabel';
import { loadFont } from '../../render/assets/loadAsset';
import { registerFontFace } from '../registerFontFace';

export interface TitleMenuPanelHandlers {
  /** Click du prompt quand aucun controller n'est pairé — ouvre le pairing. */
  readonly onConnectController: () => void;
  /** Click du prompt quand un controller est pairé (`START GAME`) — lance la partie. */
  readonly onPlay: () => void;
  /**
   * Click de « USE DEVICE AS CONTROLLER » (mobile solo uniquement) — bascule ce device en manette
   * d'un autre écran via le scanner QR in-app. Omis (desktop) = l'item n'est pas affiché.
   */
  readonly onUseAsController?: () => void;
}

/** Title text + prompt "CONNECT CONTROLLER" ⇄ "START GAME" (selon l'état pairé), both independently animatable (see `TextLabel`'s `animatableId`). */
export class TitleMenuPanel extends UIComponent {
  readonly node: Container;

  private readonly _prompt: TextLabel;
  private readonly _useAsController: TextLabel | null;
  private _controllerConnected = false;

  private constructor(handlers: TitleMenuPanelHandlers) {
    super();

    this.node = new Container();
    this.node.layout = {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 60,
    };

    const title = new TextLabel({
      text: 'TITLE\nSCREEN',
      style: {
        fill: 0xffffff,
        fontSize: 270,
        fontFamily: 'fezbox',
        align: 'center',
        letterSpacing: 4,
      },
      animatableId: 'title',
    });

    this._prompt = new TextLabel({
      text: 'CONNECT CONTROLLER',
      style: {
        fill: 0xaaaaaa,
        fontSize: 30,
        fontFamily: 'fezbox',
        align: 'center',
        letterSpacing: 2,
      },
      onClick: () =>
        this._controllerConnected ? handlers.onPlay() : handlers.onConnectController(),
      animatableId: 'connectController',
    });

    // Item supplémentaire mobile solo : basculer ce device en manette d'un autre écran. Plus petit
    // et grisé sous le prompt principal — un chemin secondaire, pas l'action par défaut.
    if (handlers.onUseAsController !== undefined) {
      this._useAsController = new TextLabel({
        text: 'USE DEVICE AS CONTROLLER',
        style: {
          fill: 0x666666,
          fontSize: 22,
          fontFamily: 'fezbox',
          align: 'center',
          letterSpacing: 2,
        },
        onClick: handlers.onUseAsController,
        animatableId: 'useAsController',
      });
      this.node.addChild(title.node, this._prompt.node, this._useAsController.node);
    } else {
      this._useAsController = null;
      this.node.addChild(title.node, this._prompt.node);
    }
  }

  /**
   * Loads and registers fezbox into this Worker's `FontFaceSet` before any `TextLabel` using it is constructed.
   *
   * @param handlers - Click handlers du prompt — voir {@link TitleMenuPanelHandlers}.
   */
  static async create(handlers: TitleMenuPanelHandlers): Promise<TitleMenuPanel> {
    const face = await loadFont('fezbox.otf');
    registerFontFace(face);
    return new TitleMenuPanel(handlers);
  }

  /** Bascule le prompt "CONNECT CONTROLLER" ⇄ "START GAME" selon l'état pairé. */
  setControllerConnected(connected: boolean): void {
    this._controllerConnected = connected;
    this._prompt.node.text = connected ? 'START GAME' : 'CONNECT CONTROLLER';
  }
}
