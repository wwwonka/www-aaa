import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { TextLabel } from '../components/TextLabel';
import { QR } from '../components/QR';
import { loadFont } from '../../render/assets/loadAsset';

/** Rôle local vu par l'UI — le worker n'importe pas la détection main-thread (`ContextManager`). */
export type PairingRole = 'controller' | 'receiver';

/** Peer découvert, relayé depuis le canal de pairing main-thread (structurellement identique à `DiscoveredPeer` côté signaling — pas d'import croisé input→ui). */
export interface PairingPeerInfo {
  readonly id: string;
  readonly name: string;
}

export interface PairingPanelOptions {
  /** Rôle local — décide des textes et de la présence du QR (receiver seulement). */
  readonly role: PairingRole;
  /** URL de la page (origin+pathname), lue côté main — `location` du worker n'est pas celle de la page. */
  readonly pageUrl: string;
  /** Code de session du receiver, encodé dans le QR via `?r=` — `null` côté controller. */
  readonly roomCode: string | null;
  /** Nom de ce device (généré côté main, voir `input/signaling/identity.ts`). */
  readonly deviceName: string;
  /** Clic sur le chip d'un peer découvert (receiver) — remonte au main qui envoie `connect`. */
  readonly onConnectPeer: (peerId: string) => void;
}

const GRAY = 0x8a8a8a;
const DIM_GRAY = 0x555555;

/**
 * Contenu partagé du modal de pairing (receiver et controller) — la présentation (sheet vs
 * plein écran) appartient à `PairingOverlayScreen`. Deux états visuels : *searching* (défaut)
 * et *paired* (voir {@link PairingPanel.setPaired} — déclenché par `CONTROLLER_CONNECTED`).
 */
export class PairingPanel extends UIComponent {
  readonly node: Container;

  private readonly _status: TextLabel;
  private readonly _heading: TextLabel;
  private readonly _searchOnly: readonly Container[];
  private readonly _peerList: Container;
  private readonly _onConnectPeer: (peerId: string) => void;
  private readonly _role: PairingRole;
  private _paired = false;

  private constructor({ role, pageUrl, roomCode, deviceName, onConnectPeer }: PairingPanelOptions) {
    super();
    this._role = role;
    this._onConnectPeer = onConnectPeer;

    this.node = new Container();
    this.node.layout = {
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
    };

    const isReceiver = role === 'receiver';

    this._status = new TextLabel({
      text: isReceiver ? 'SEARCHING FOR A CONTROLLER' : 'SEARCHING FOR A RECEIVER',
      style: { fill: GRAY, fontSize: 22, fontFamily: 'fezbox', letterSpacing: 3 },
    });

    this._heading = new TextLabel({
      text: isReceiver ? 'CONNECT GAMEPAD OR\nSCAN FROM PHONE' : 'OPEN GAME ON PC OR TV',
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

    const chip = this._buildDeviceChip(deviceName);

    // Rangée des controllers découverts — remplace visuellement le QR dès qu'un peer s'annonce.
    this._peerList = new Container();
    this._peerList.layout = { flexDirection: 'row', gap: 16 };
    this._peerList.visible = false;

    const searchOnly: Container[] = [];
    this.node.addChild(this._status.node, this._heading.node);
    if (isReceiver && roomCode !== null) {
      const qr = new QR({ text: `${pageUrl}?r=${roomCode}` });
      this.node.addChild(qr.node);
      searchOnly.push(qr.node);
    }
    this.node.addChild(this._peerList, url.node, divider, thisDeviceIs.node, chip);
    searchOnly.push(url.node);
    this._searchOnly = searchOnly;
  }

  /** Loads fezbox into this worker's `FontFaceSet` before any label is constructed (same pattern as `TitleMenuPanel`). */
  static async create(options: PairingPanelOptions): Promise<PairingPanel> {
    const face = await loadFont('fezbox.otf');
    (self as unknown as WorkerGlobalScope & { fonts: FontFaceSet }).fonts.add(face);
    return new PairingPanel(options);
  }

  /**
   * Bascule searching ⇄ paired. L'Étape 2 branchera le vrai signal réseau ; l'UI est prête.
   *
   * @param peerName - Nom du peer connecté, ou `null` pour revenir à l'état searching.
   */
  setPaired(peerName: string | null): void {
    this._paired = peerName !== null;
    if (peerName !== null) {
      this._status.node.text = 'PAIRED WITH';
      this._heading.node.text = peerName.toUpperCase();
      this._peerList.visible = false;
      for (const node of this._searchOnly) node.visible = false;
    } else {
      this._showSearching();
    }
  }

  /**
   * Receiver : liste des controllers découverts dans la room — chips cliquables qui remplacent
   * le QR. Une liste vide restaure l'état searching (sauf si déjà pairé).
   *
   * @param peers - Peers annoncés par le canal de pairing (voir `AppHost`).
   */
  setDiscoveredPeers(peers: readonly PairingPeerInfo[]): void {
    for (const chip of this._peerList.removeChildren()) chip.destroy({ children: true });
    for (const peer of peers) this._peerList.addChild(this._buildPeerChip(peer));

    if (this._paired) return;
    if (peers.length > 0) {
      this._status.node.text =
        peers.length > 1 ? `${peers.length} CONTROLLERS FOUND` : 'CONTROLLER FOUND';
      this._heading.node.text = 'TAP TO CONNECT';
      this._peerList.visible = true;
      for (const node of this._searchOnly) node.visible = false;
    } else {
      this._showSearching();
    }
  }

  private _showSearching(): void {
    const isReceiver = this._role === 'receiver';
    this._status.node.text = isReceiver ? 'SEARCHING FOR A CONTROLLER' : 'SEARCHING FOR A RECEIVER';
    this._heading.node.text = isReceiver
      ? 'CONNECT GAMEPAD OR\nSCAN FROM PHONE'
      : 'OPEN GAME ON PC OR TV';
    this._peerList.visible = false;
    for (const node of this._searchOnly) node.visible = true;
  }

  private _buildPeerChip(peer: PairingPeerInfo): Container {
    const chip = this._buildDeviceChip(peer.name);
    chip.eventMode = 'static';
    chip.cursor = 'pointer';
    chip.on('pointertap', () => this._onConnectPeer(peer.id));
    return chip;
  }

  private _buildDeviceChip(deviceName: string): Container {
    const chip = new Container();
    const label = new Text({
      text: deviceName.toUpperCase(),
      style: new TextStyle({
        fill: 0xffffff,
        fontSize: 24,
        fontFamily: 'fezbox',
        letterSpacing: 3,
      }),
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
}
