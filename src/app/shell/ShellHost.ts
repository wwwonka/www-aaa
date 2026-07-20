import './shell.css';
import { appOrchestrator } from '../../core/AppOrchestrator';
import { assetPath } from '../../core/assets/assetPath';
import { Toast } from './components/Toast';
import { RotateGate } from './components/RotateGate';
import { JoysticksView } from './components/JoysticksView';
import { PairingOverlay } from './components/PairingOverlay';
import { setupInput } from '../boot/input';
import type { InputHub } from '../../input/InputHub';
import type { PairingStatus, PeerRole } from '../../input/signaling/types';

export interface ShellHostOptions {
  /** Ce device utilise des joysticks tactiles (solo mobile OU controller) → joysticks + gate. */
  readonly usesTouchInput: boolean;
  /**
   * Sink des axes réduits (`pairingHost.sendInput` : SAB local si autorité, sinon RTC). ShellHost
   * construit le hub d'input (manette + tactile) autour de ce sink et pilote son cycle de vie selon
   * l'AppState (tourne en jeu hors portrait, stoppé sinon). Le hub est exposé via {@link ShellHost.inputHub}.
   */
  readonly axisSink: (dirX: number, dirZ: number) => void;
  /** START pressé (controller) → lance la partie (PLAY + sync du peer). */
  readonly onStart: () => void;
  /** Identité de session + reprises pour l'overlay de pairing (QR + pastilles) — voir `PairingOverlay`. */
  readonly pairing: {
    readonly role: PeerRole;
    readonly pageUrl: string;
    readonly roomCode: string | null;
    readonly deviceName: string;
    /** Bouton RETRY (phase `error`) — relance une passe de connexion. */
    readonly onRetry: () => void;
    /** Bouton SCAN AGAIN (controller) — ré-ouvre le scanner pour un nouveau code de room. */
    readonly onScanAgain?: () => void;
  };
}

/**
 * Hôte du shell applicatif en **DOM/CSS** (main thread) — le pendant DOM de `RenderManager` pour
 * tout ce qui n'est pas le jeu ni l'UI « esthétique de jeu ». Crée le shell root par-dessus le
 * canvas, possède les composants DOM (toasts, gate d'orientation, joysticks), et réagit à
 * l'`AppState` directement (l'orchestrateur vit sur le main). Le pairing suivra (Phase 3).
 */
export class ShellHost {
  private readonly _root: HTMLElement;
  private readonly _toast: Toast;
  private readonly _rotate: RotateGate | null;
  private readonly _joysticksView: JoysticksView | null;
  private readonly _hub: InputHub;
  private readonly _axisSink: (dirX: number, dirZ: number) => void;
  private readonly _pairing: PairingOverlay;
  /** Gate des axes : ouvert seulement en jeu hors portrait (le hub, lui, tourne dès le title). */
  private _axesOpen = false;
  private _portrait = false;
  private _lastState: string | null = null;
  private _inGame = false;
  private _pairingOpen = false;
  private _controllerMode = false;

  constructor(opts: ShellHostOptions) {
    this._root = document.createElement('div');
    this._root.id = 'shell-root';
    document.body.appendChild(this._root);
    void loadShellFont();

    this._toast = new Toast(this._root);
    // Gate d'orientation + joysticks : uniquement sur les devices à input tactile.
    this._rotate = opts.usesTouchInput ? new RotateGate(this._root) : null;
    this._joysticksView = opts.usesTouchInput ? new JoysticksView(this._root, opts.onStart) : null;
    // Hub d'input (manette + tactile) construit autour du sink — la vue existe déjà, donc la
    // TouchSource peut être branchée. Même câblage sur les deux hosts (voir boot/input).
    // Les axes traversent un gate : le hub tourne dès le title (pour voir les boutons manette,
    // ex. Cross/Share → PLAY) mais aucun axe ne part vers SAB/RTC hors jeu (pas de trafic fantôme).
    this._axisSink = opts.axisSink;
    this._hub = setupInput({
      axisSink: (dirX, dirZ) => {
        if (this._axesOpen) this._axisSink(dirX, dirZ);
      },
      joysticksView: this._joysticksView,
    });
    this._pairing = new PairingOverlay(this._root, {
      ...opts.pairing,
      onClose: () => appOrchestrator.send({ type: 'CLOSE_PAIRING' }),
    });

    // L'orchestrateur tourne sur le main : on réagit à l'AppState en direct (pas de round-trip).
    appOrchestrator.subscribe((snapshot) => {
      const state = snapshot.value as string;
      if (state === this._lastState) return; // dedupe (ASSET_* ré-émet des snapshots)
      this._lastState = state;
      this._inGame = state === 'IN_GAME';
      this._pairingOpen = state === 'PAIRING_MODE';
      this._pairing.setActive(this._pairingOpen);
      this._sync();
    });

    // Sync initial : le hub doit tourner dès le boot (title inclus) sans attendre une première
    // transition d'AppState — sinon un Cross/Share au title ne serait jamais vu.
    this._sync();
  }

  /** Le hub d'input construit par ce shell — exposé pour que `initDev` y branche des sources dev. */
  get inputHub(): InputHub {
    return this._hub;
  }

  /** Phase du cycle de pairing réseau — source unique poussée par `pairingHost`. */
  setPairingStatus(status: PairingStatus): void {
    this._pairing.setStatus(status);
  }

  /** Notification transitoire en haut de l'écran (file d'attente, un à la fois). */
  showToast(message: string): void {
    this._toast.show(message);
  }

  /** Orientation courante (détectée côté main via `matchMedia`) — pilote le gate landscape. */
  setPortrait(portrait: boolean): void {
    this._portrait = portrait;
    this._sync();
  }

  /**
   * Ce device est passé en controller (« USE DEVICE AS CONTROLLER » ou boot controller) : il montre
   * un bouton START (état ready) au lieu de rien, puis les joysticks une fois en jeu. Le solo, lui,
   * lance la partie depuis le Title Screen Pixi (pas de START shell).
   */
  setControllerMode(on: boolean): void {
    this._controllerMode = on;
    this._sync();
  }

  private _sync(): void {
    // Gate d'orientation : portrait + en jeu.
    this._rotate?.setActive(this._portrait && this._inGame);
    // Les AXES coulent en jeu, sauf en portrait (soft-pause mobile). La surface tactile n'écoute
    // les pointeurs que quand elle est active.
    const axesOpen = this._inGame && !this._portrait;
    this._joysticksView?.setActive(axesOpen);
    // START : mode controller, tant qu'on n'est ni en jeu ni sous l'overlay de pairing (il
    // transparaîtrait à travers le panneau à 97 % d'opacité).
    this._joysticksView?.showStart(this._controllerMode && !this._inGame && !this._pairingOpen);
    // Fermeture du gate (quit, transfert, passage portrait) : un dernier recentrage part vers le
    // transport AVANT de bloquer — sinon les derniers axes non nuls resteraient dans le SAB/RTC.
    if (this._axesOpen && !axesOpen) this._axisSink(0, 0);
    this._axesOpen = axesOpen;
    // Le hub, lui, tourne hors jeu aussi (boutons manette au title : Cross/Share → PLAY) ; il ne
    // s'arrête qu'en portrait (soft-pause complet). Son stop émet des axes nuls — gatés si fermé.
    if (this._portrait) this._hub.stop();
    else this._hub.start();
  }
}

/** Charge fezbox depuis le cache asset (servi par le SW depuis IndexedDB) et l'ajoute au document. */
async function loadShellFont(): Promise<void> {
  try {
    const url = `/${assetPath('game', 'font', 'fezbox.otf')}`;
    const face = new FontFace('fezbox', `url(${url})`);
    await face.load();
    document.fonts.add(face);
  } catch (err) {
    console.warn('[shell] fezbox indisponible, fallback system-ui —', err);
  }
}
