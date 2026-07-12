import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { TextLabel } from '../components/TextLabel';
import { QR } from '../components/QR';
import { loadFont } from '../../render/assets/loadAsset';
import { registerFontFace } from '../registerFontFace';

/** Rôle local vu par l'UI — le worker n'importe pas la détection main-thread (`ContextManager`). */
export type PairingRole = 'controller' | 'receiver';

/**
 * Phase du cycle de pairing — **source unique de vérité** poussée par `pairingHost` via
 * `renderApi.setPairingPhase`. Les écrans ne décident rien, ils rendent la phase :
 * `searching` (QR / recherche) → `pairing` (peer découvert, connexion auto en cours, pastille) →
 * `paired` (connecté). Un futur `reconnecting` s'insère ici sans toucher aux écrans.
 */
export type PairingPhase = 'searching' | 'pairing' | 'paired';

const GRAY = 0x8a8a8a;
const DIM_GRAY = 0x555555;
const QR_FADE_MS = 260;

export interface PairingPanelOptions {
  /** Rôle local — décide des textes et de la présence du QR (receiver seulement). */
  readonly role: PairingRole;
  /** URL de la page (origin+pathname), lue côté main — `location` du worker n'est pas celle de la page. */
  readonly pageUrl: string;
  /** Code de session du receiver, encodé dans le QR via `?r=` — `null` côté controller. */
  readonly roomCode: string | null;
  /** Nom de ce device (généré côté main, voir `input/signaling/identity.ts`). */
  readonly deviceName: string;
}

/**
 * Contenu partagé du modal de pairing (receiver et controller) — la présentation (sheet vs plein
 * écran) appartient à `PairingOverlayScreen`. Rend une {@link PairingPhase} : QR (searching) qui
 * s'efface dès qu'un peer du rôle opposé est découvert, remplacé par la **pastille du peer**.
 */
export class PairingPanel extends UIComponent {
  readonly node: Container;

  private readonly _role: PairingRole;
  private readonly _status: TextLabel;
  private readonly _heading: TextLabel;
  private readonly _searchOnly: readonly Container[]; // visibles seulement en 'searching' (QR + url)
  private readonly _qr: Container | null;
  private readonly _peerSlot: Container; // pastille du peer opposé (1 seul — room QR-scopée)

  private _qrFade = 1; // 1 = visible, 0 = effacé
  private _qrFadeTarget = 1;

  private constructor({ role, pageUrl, roomCode, deviceName }: PairingPanelOptions) {
    super();
    this._role = role;

    this.node = new Container();
    this.node.layout = {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
    };

    const isReceiver = role === 'receiver';

    this._status = new TextLabel({
      text: this._searchingStatus(),
      style: { fill: GRAY, fontSize: 22, fontFamily: 'fezbox', letterSpacing: 3 },
    });

    this._heading = new TextLabel({
      text: this._searchingHeading(),
      style: {
        fill: 0xffffff,
        fontSize: 34,
        fontFamily: 'fezbox',
        align: 'center',
        letterSpacing: 3,
        lineHeight: 48,
      },
    });
    // Multi-ligne : la hauteur par défaut de TextLabel suppose une seule ligne.
    if (isReceiver) this._heading.node.layout = { width: 'intrinsic', height: 100 };

    const url = new TextLabel({
      text: pageUrl.replace(/^https?:\/\//, '').toUpperCase(),
      style: { fill: DIM_GRAY, fontSize: 16, fontFamily: 'fezbox', letterSpacing: 2 },
    });

    const divider = new Container();
    divider.layout = { width: 420, height: 1, marginTop: 14, marginBottom: 14 };
    divider.addChild(new Graphics().rect(0, 0, 420, 1).fill({ color: 0x333333 }));

    const thisDeviceIs = new TextLabel({
      text: 'THIS DEVICE IS',
      style: { fill: GRAY, fontSize: 18, fontFamily: 'fezbox', letterSpacing: 3 },
    });
    const chip = buildDeviceChip(deviceName);

    // Pastille du peer opposé (nom du controller/receiver) — visible dès 'pairing'.
    this._peerSlot = new Container();
    this._peerSlot.layout = { flexDirection: 'row', gap: 16 };
    this._peerSlot.visible = false;

    const searchOnly: Container[] = [];
    this.node.addChild(this._status.node, this._heading.node);
    let qr: Container | null = null;
    if (isReceiver && roomCode !== null) {
      qr = new QR({ text: `${pageUrl}?r=${roomCode}` }).node;
      this.node.addChild(qr);
      searchOnly.push(qr);
    }
    this._qr = qr;
    this.node.addChild(this._peerSlot, url.node, divider, thisDeviceIs.node, chip);
    searchOnly.push(url.node);
    this._searchOnly = searchOnly;
  }

  /** Loads fezbox into this worker's `FontFaceSet` before any label is constructed (same pattern as `TitleMenuPanel`). */
  static async create(options: PairingPanelOptions): Promise<PairingPanel> {
    const face = await loadFont('fezbox.otf');
    registerFontFace(face);
    return new PairingPanel(options);
  }

  /**
   * Applique la phase du pairing (source unique côté `pairingHost`).
   *
   * @param peerName - Nom du peer opposé pour la pastille (`null` en `searching`).
   */
  setPhase(phase: PairingPhase, peerName: string | null): void {
    if (phase === 'searching' || peerName === null) {
      this._status.node.text = this._searchingStatus();
      this._heading.node.text = this._searchingHeading();
      this._heading.node.visible = true;
      this._peerSlot.visible = false;
      for (const n of this._searchOnly) if (n !== this._qr) n.visible = true;
      this._qrFadeTarget = 1;
      return;
    }
    // pairing | paired : la pastille du peer remplace le QR (qui s'efface).
    this._status.node.text = phase === 'paired' ? 'PAIRED WITH' : 'CONNECTING TO';
    this._heading.node.visible = false;
    this._setPeer(peerName);
    for (const n of this._searchOnly) if (n !== this._qr) n.visible = false;
    this._qrFadeTarget = 0;
  }

  /** Fait avancer le fondu du QR — pompé par `PairingOverlayScreen.update`. */
  update(delta: number): void {
    if (this._qr === null || this._qrFade === this._qrFadeTarget) return;
    const step = delta / QR_FADE_MS;
    this._qrFade =
      this._qrFadeTarget > this._qrFade
        ? Math.min(this._qrFade + step, 1)
        : Math.max(this._qrFade - step, 0);
    this._qr.alpha = this._qrFade;
    this._qr.visible = this._qrFade > 0;
  }

  private _setPeer(name: string): void {
    for (const c of this._peerSlot.removeChildren()) c.destroy({ children: true });
    this._peerSlot.addChild(buildDeviceChip(name));
    this._peerSlot.visible = true;
  }

  private _searchingStatus(): string {
    return this._role === 'receiver' ? 'SEARCHING FOR A CONTROLLER' : 'SEARCHING FOR A RECEIVER';
  }

  private _searchingHeading(): string {
    return this._role === 'receiver'
      ? 'CONNECT GAMEPAD OR\nSCAN FROM PHONE'
      : 'OPEN GAME ON PC OR TV';
  }
}

function buildDeviceChip(deviceName: string): Container {
  const chip = new Container();
  const label = new Text({
    text: deviceName.toUpperCase(),
    style: new TextStyle({ fill: 0xffffff, fontSize: 24, fontFamily: 'fezbox', letterSpacing: 3 }),
  });

  // `Text` mesure synchroniquement — on dimensionne le fond (et le layout Yoga) d'après lui.
  const padX = 28;
  const padY = 14;
  const w = label.width + padX * 2;
  const h = label.height + padY * 2;

  const bg = new Graphics()
    .roundRect(0, 0, w, h, 10)
    .fill({ color: 0x000000, alpha: 0.5 })
    .stroke({ color: 0x3a3a3a, width: 1.5 });
  label.position.set(padX, padY);

  chip.layout = { width: w, height: h };
  chip.addChild(bg, label);
  return chip;
}
