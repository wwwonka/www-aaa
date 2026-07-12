import './shell.css';
import { appOrchestrator } from '../../core/AppOrchestrator';
import { assetPath } from '../../core/assetPath';
import { Toast } from './components/Toast';
import { RotateGate } from './components/RotateGate';
import { Joysticks } from './components/Joysticks';
import { PairingOverlay } from './components/PairingOverlay';
import type { PairingStatus, PeerRole } from '../../input/signaling/types';

export interface ShellHostOptions {
  /** Ce device utilise des joysticks tactiles (solo mobile OU controller) → joysticks + gate. */
  readonly usesTouchInput: boolean;
  /** Axes échantillonnés par les joysticks → sink `pairingHost.sendInput` (SAB local OU RTC). */
  readonly onInput: (dirX: number, dirZ: number) => void;
  /** START pressé (controller) → lance la partie (PLAY + sync du peer). */
  readonly onStart: () => void;
  /** Identité de session pour l'overlay de pairing (QR + pastilles) — voir `PairingOverlay`. */
  readonly pairing: {
    readonly role: PeerRole;
    readonly pageUrl: string;
    readonly roomCode: string | null;
    readonly deviceName: string;
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
  private readonly _joysticks: Joysticks | null;
  private readonly _pairing: PairingOverlay;
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
    this._joysticks = opts.usesTouchInput
      ? new Joysticks(this._root, { onInput: opts.onInput, onStart: opts.onStart })
      : null;
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
    // Joysticks : actifs en jeu. START : mode controller, tant qu'on n'est ni en jeu ni sous
    // l'overlay de pairing (il transparaîtrait à travers le panneau à 97 % d'opacité).
    this._joysticks?.setActive(this._inGame);
    this._joysticks?.showStart(this._controllerMode && !this._inGame && !this._pairingOpen);
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
