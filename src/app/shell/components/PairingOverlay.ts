import type { PairingErrorReason, PairingStatus, PeerRole } from '../../../input/signaling/types';
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
  /** Bouton RETRY (phase `error`) — relance une passe de connexion sur la même room. */
  readonly onRetry: () => void;
  /**
   * Bouton SCAN AGAIN (phase `error`, controller uniquement) — ré-ouvre le scanner caméra pour
   * capter un NOUVEAU code : RETRY seul ne peut jamais aboutir sur une room morte (receiver
   * fermé → code périmé). Absent côté receiver (il ré-essaie sa propre room).
   */
  readonly onScanAgain?: () => void;
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
  /** Boutons de reprise (RETRY / SCAN AGAIN) — visibles seulement en `error`. */
  private readonly _actions: HTMLElement;
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

    // Reprise sur erreur : RETRY (même room) + SCAN AGAIN (controller — nouveau code). Hors flux
    // tant qu'on n'est pas en `error`.
    this._actions = elem('div', 'shell-pairing__actions');
    this._actions.appendChild(button('RETRY', opts.onRetry));
    if (!isReceiver && opts.onScanAgain !== undefined)
      this._actions.appendChild(button('SCAN AGAIN', opts.onScanAgain));
    sheet.appendChild(this._actions);

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
  setStatus({ phase, peerName, errorReason }: PairingStatus): void {
    // `searching` sans peer = seul cas qui montre QR + heading ; tout le reste les masque.
    const searching = phase === 'searching' && peerName === null;
    const isError = phase === 'error';

    this._status.textContent = this._statusLabel(phase, errorReason);
    this._heading.style.display = searching ? '' : 'none';

    // Pastille du peer : visible dès qu'on a un nom (pairing / paired / reconnecting), jamais en error.
    const showPeer = peerName !== null && !isError;
    if (showPeer) this._peer.textContent = peerName;
    this._peer.classList.toggle('shell-pairing__peer--visible', showPeer);

    this._actions.classList.toggle('shell-pairing__actions--visible', isError);

    for (const el of this._searchOnly)
      el.classList.toggle('shell-pairing__search-only--hidden', !searching);
  }

  private _statusLabel(phase: PairingStatus['phase'], reason: PairingErrorReason | undefined): string {
    switch (phase) {
      case 'paired':
        return 'PAIRED WITH';
      case 'pairing':
        return 'CONNECTING TO';
      case 'reconnecting':
        return 'RECONNECTING TO';
      case 'error':
        return this._errorLabel(reason);
      default:
        return this._searchingStatus();
    }
  }

  private _errorLabel(reason: PairingErrorReason | undefined): string {
    if (reason === 'version') return 'VERSION MISMATCH — RELOAD';
    if (reason === 'busy') return 'GAME ALREADY HAS A CONTROLLER';
    return this._role === 'receiver' ? 'NO CONTROLLER FOUND' : "COULDN'T REACH THE GAME";
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

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'shell-pairing__btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Intercale des `<br>` entre les lignes (flatMap joiner). */
function brJoin(line: string, i: number): (HTMLElement | globalThis.Text)[] {
  const text = document.createTextNode(line);
  return i === 0 ? [text] : [document.createElement('br'), text];
}
