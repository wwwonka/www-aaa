import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { UIScreen } from '../UIScreen';
import { easeIn, easeOut } from '../layout';
import { PairingPanel } from '../panels/PairingPanel';
import type { PairingPeerInfo, PairingRole } from '../panels/PairingPanel';

interface PairingOverlayOptions {
  readonly role: PairingRole;
  readonly pageUrl: string;
  /** Code de session encodé dans le QR (`?r=`) — `null` côté controller. */
  readonly roomCode: string | null;
  readonly deviceName: string;
  /** Clic sur le chip d'un peer découvert — relayé au main (envoi de `connect`). */
  readonly onConnectPeer: (peerId: string) => void;
  /** Invoqué par le backdrop (receiver) ou le ✕ (controller) — remonte `CLOSE_PAIRING` au main. */
  readonly onClose: () => void;
}

const SHEET_MAX_WIDTH = 720;
const SHEET_WIDTH_RATIO = 0.9;
const SHEET_HEIGHT_RATIO = 0.82;
const SLIDE_MS = 320;
const BACKDROP_ALPHA = 0.55;

/**
 * Overlay `PAIRING_MODE` (voir `AppOrchestrator`) — le screen sous-jacent reste visible dessous
 * (`isOverlay`, voir `ScreenManager`). Deux présentations du même `PairingPanel` :
 * receiver = sheet ancrée en bas qui glisse (backdrop assombri cliquable pour fermer),
 * controller = panneau quasi-plein-écran en fondu avec un ✕.
 */
export class PairingOverlayScreen extends UIScreen {
  readonly layer = 'overlayUI' as const;
  override readonly isOverlay = true;

  private readonly _role: PairingRole;
  private readonly _backdrop: Graphics = new Graphics();
  private readonly _sheet: Container = new Container();
  private readonly _panel: PairingPanel;
  private _sheetContent!: Container;
  private _closeButton: Container | null = null;

  // Tween de slide (receiver) — le fade alpha de la base UIScreen gère le mode controller.
  private _slideDir: 'in' | 'out' | null = null;
  private _slideElapsed = 0;

  private constructor(
    width: number,
    height: number,
    panel: PairingPanel,
    { role, onClose }: PairingOverlayOptions,
  ) {
    super(width, height);
    this._role = role;
    this._panel = panel;

    if (role === 'receiver') {
      this._backdrop.alpha = 0;
      this._backdrop.eventMode = 'static';
      this._backdrop.on('pointertap', onClose);
      this.node.addChild(this._backdrop, this._sheet);
      this._sheet.addChild(this._buildSheetContent(panel));
    } else {
      this.node.addChild(this._sheet);
      this._sheet.addChild(this._buildSheetContent(panel));
      this._closeButton = this._buildCloseButton(onClose);
      this._sheet.addChild(this._closeButton);
    }

    this._layoutSheet();
  }

  static async create(
    width: number,
    height: number,
    options: PairingOverlayOptions,
  ): Promise<PairingOverlayScreen> {
    const panel = await PairingPanel.create(options);
    return new PairingOverlayScreen(width, height, panel, options);
  }

  /** Relaye searching ⇄ paired au panneau — appelé par `RenderManager` sur `CONTROLLER_CONNECTED`. */
  setPaired(peerName: string | null): void {
    this._panel.setPaired(peerName);
  }

  /** Relaye la liste des peers découverts au panneau (receiver) — voir `PairingPanel.setDiscoveredPeers`. */
  setDiscoveredPeers(peers: readonly PairingPeerInfo[]): void {
    this._panel.setDiscoveredPeers(peers);
  }

  /** Receiver : slide-up custom (pas le fade de base) ; controller : fade `UIScreen` standard. */
  override onEnter(): void {
    if (this._role === 'controller') {
      super.onEnter();
      return;
    }
    this.node.alpha = 1;
    this.node.eventMode = 'passive';
    this._slideDir = 'in';
    this._slideElapsed = 0;
  }

  override onLeave(): void {
    if (this._role === 'controller') {
      super.onLeave();
      return;
    }
    this.node.eventMode = 'none';
    this._slideDir = 'out';
    this._slideElapsed = 0;
  }

  /** Fait avancer le tween de slide (receiver) en plus du fade de base — voir `SLIDE_MS`. */
  override update(delta: number): void {
    super.update(delta);
    if (this._slideDir === null) return;

    this._slideElapsed += delta;
    const t = Math.min(this._slideElapsed / SLIDE_MS, 1);
    const progress = this._slideDir === 'in' ? easeOut(t) : 1 - easeIn(t);

    const sheetHeight = this._sheetHeight();
    this._sheet.y = this._height - sheetHeight * progress;
    this._backdrop.alpha = progress;

    if (t >= 1) {
      this._slideDir = null;
      if (progress === 0) this.node.alpha = 0;
    }
  }

  protected _onResize(): void {
    this._layoutSheet();
  }

  private _sheetWidth(): number {
    if (this._role === 'controller') return this._width;
    return Math.min(this._width * SHEET_WIDTH_RATIO, SHEET_MAX_WIDTH);
  }

  private _sheetHeight(): number {
    return this._role === 'controller' ? this._height : this._height * SHEET_HEIGHT_RATIO;
  }

  private _layoutSheet(): void {
    const w = this._sheetWidth();
    const h = this._sheetHeight();

    this._backdrop
      .clear()
      .rect(0, 0, this._width, this._height)
      .fill({ color: 0x000000, alpha: BACKDROP_ALPHA });

    this._sheet.x = (this._width - w) / 2;
    // Position de repos hors tween : visible si affiché, parqué sous l'écran sinon.
    this._sheet.y =
      this.node.alpha > 0 || this._role === 'controller' ? this._height - h : this._height;

    this._redrawSheetBg();
    this._sheetContent.layout = {
      width: w,
      height: h,
      justifyContent: 'center',
      alignItems: 'center',
    };
    this._closeButton?.position.set(w - 76, 24);
  }

  private _buildSheetContent(panel: PairingPanel): Container {
    this._sheetContent = new Container();

    const bg = new Graphics();
    bg.label = 'sheet-bg';
    this._sheetContent.addChild(bg, panel.node);
    return this._sheetContent;
  }

  private _redrawSheetBg(): void {
    const bg = this._sheet.getChildByLabel('sheet-bg', true) as Graphics | null;
    if (!bg) return;
    const w = this._sheetWidth();
    const h = this._sheetHeight();
    bg.clear();
    if (this._role === 'receiver') {
      // Coins arrondis en haut seulement — la sheet déborde sous le bas de l'écran.
      bg.roundRect(0, 0, w, h + 40, 28).fill({ color: 0x0c0c0f, alpha: 0.97 });
      bg.roundRect(0, 0, w, h + 40, 28).stroke({ color: 0x2a2a2e, width: 1.5 });
    } else {
      bg.rect(0, 0, w, h).fill({ color: 0x0c0c0f, alpha: 0.97 });
    }
  }

  private _buildCloseButton(onClose: () => void): Container {
    const button = new Container();
    const radius = 26;
    const circle = new Graphics()
      .circle(radius, radius, radius)
      .fill({ color: 0x1a1a1e, alpha: 0.9 })
      .stroke({ color: 0x3a3a3e, width: 1.5 });
    const cross = new Text({
      text: '✕',
      style: new TextStyle({ fill: 0xcccccc, fontSize: 22 }),
    });
    cross.anchor.set(0.5);
    cross.position.set(radius, radius);

    button.addChild(circle, cross);
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointertap', onClose);
    button.position.set(this._width - radius * 2 - 24, 24);
    return button;
  }
}
