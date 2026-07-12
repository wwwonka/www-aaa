import type { PairingStatus, PeerRole } from '../../../input/signaling/types';
import { createQrCard } from './QrCard';

export interface PairingOverlayOptions {
  /** Rôle local — décide des textes, de la présentation (sheet vs plein écran) et du QR. */
  readonly role: PeerRole;
  /** URL de la page (origin+pathname) — affichée et encodée dans le QR via `?r=`. */
  readonly pageUrl: string;
  /** Code de session du receiver, encodé dans le QR — `null` côté controller. */
  readonly roomCode: string | null;
  /** Nom de ce device (généré côté main, voir `input/signaling/identity.ts`). */
  readonly deviceName: string;
  /** Invoqué par le backdrop (receiver) ou le ✕ (controller) — remonte `CLOSE_PAIRING`. */
  readonly onClose: () => void;
}

/**
 * Overlay de pairing DOM (`PAIRING_MODE`) — équivalent shell des anciens
 * `PairingOverlayScreen`/`PairingPanel` Pixi. Deux présentations du même contenu :
 * receiver = sheet ancrée en bas qui glisse (backdrop assombri cliquable pour fermer),
 * controller = panneau plein écran en fondu avec un ✕. Rend une {@link PairingStatus} :
 * QR (searching) qui s'efface dès qu'un peer du rôle opposé est découvert, remplacé par la
 * pastille du peer.
 */
export class PairingOverlay {
  private readonly _el: HTMLElement;
  private readonly _role: PeerRole;
  private readonly _status: HTMLElement;
  private readonly _heading: HTMLElement;
  private readonly _peer: HTMLElement;
  /** Visibles seulement en `searching` (QR + url). */
  private readonly _searchOnly: readonly HTMLElement[];

  constructor(root: HTMLElement, opts: PairingOverlayOptions) {
    this._role = opts.role;
    const isReceiver = opts.role === 'receiver';

    this._el = document.createElement('div');
    this._el.className = `shell-pairing${isReceiver ? '' : ' shell-pairing--fullscreen'}`;

    const backdrop = document.createElement('div');
    backdrop.className = 'shell-pairing__backdrop';
    if (isReceiver) backdrop.addEventListener('click', opts.onClose);
    this._el.appendChild(backdrop);

    const sheet = document.createElement('div');
    sheet.className = 'shell-pairing__sheet';
    this._el.appendChild(sheet);

    if (!isReceiver) {
      const close = document.createElement('button');
      close.className = 'shell-pairing__close';
      close.textContent = '✕';
      close.addEventListener('click', opts.onClose);
      sheet.appendChild(close);
    }

    this._status = elem('div', 'shell-pairing__status', this._searchingStatus());
    this._heading = elem('div', 'shell-pairing__heading');
    // Multi-ligne contrôlée (pas de wrap navigateur) — même découpe que la version Pixi.
    this._heading.append(...this._searchingHeading().split('\n').flatMap(brJoin));

    const searchOnly: HTMLElement[] = [];
    sheet.append(this._status, this._heading);

    if (isReceiver && opts.roomCode !== null) {
      const qr = createQrCard(`${opts.pageUrl}?r=${opts.roomCode}`);
      sheet.appendChild(qr);
      searchOnly.push(qr);
    }

    // Pastille du peer opposé (1 seul — room QR-scopée) — visible dès 'pairing'.
    this._peer = elem('div', 'shell-pairing__chip shell-pairing__peer');
    sheet.appendChild(this._peer);

    const url = elem('div', 'shell-pairing__url', opts.pageUrl.replace(/^https?:\/\//, ''));
    searchOnly.push(url);
    sheet.append(
      url,
      elem('div', 'shell-pairing__divider'),
      elem('div', 'shell-pairing__label', 'THIS DEVICE IS'),
      elem('div', 'shell-pairing__chip', opts.deviceName),
    );
    this._searchOnly = searchOnly;

    this.setStatus({ phase: 'searching', peerName: null });
    root.appendChild(this._el);
  }

  /** Ouvre/ferme l'overlay — transitions CSS (slide receiver / fade controller). */
  setActive(on: boolean): void {
    this._el.classList.toggle('shell-pairing--active', on);
  }

  /** Applique la phase du pairing (source unique côté `pairingHost`). */
  setStatus({ phase, peerName }: PairingStatus): void {
    const searching = phase === 'searching' || peerName === null;
    if (searching) {
      this._status.textContent = this._searchingStatus();
      this._heading.style.display = '';
      this._peer.classList.remove('shell-pairing__peer--visible');
    } else {
      // pairing | paired : la pastille du peer remplace le QR (qui s'efface).
      this._status.textContent = phase === 'paired' ? 'PAIRED WITH' : 'CONNECTING TO';
      this._heading.style.display = 'none';
      this._peer.textContent = peerName;
      this._peer.classList.add('shell-pairing__peer--visible');
    }
    for (const el of this._searchOnly)
      el.classList.toggle('shell-pairing__search-only--hidden', !searching);
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

function elem(tag: string, className: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Intercale des `<br>` entre les lignes (flatMap joiner). */
function brJoin(line: string, i: number): (HTMLElement | globalThis.Text)[] {
  const text = document.createTextNode(line);
  return i === 0 ? [text] : [document.createElement('br'), text];
}
