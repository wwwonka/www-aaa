import { sampleStick, type StickSample } from '../../../input/stickMath';
import { reduceSticks } from '../../../input/stickReducer';

const MAX_RADIUS = 70; // rayon max du déplacement du nub (px)
const SAMPLE_MS = 33; // ~30 Hz (aligné sur l'ancien GamepadScreen)
const KEEPALIVE_MS = 500;
const QUANT = 32767;
const quant = (v: number): number => (Math.max(-1, Math.min(1, v)) * QUANT) | 0;

interface Side {
  pointerId: number | null;
  baseX: number;
  baseY: number;
  sample: StickSample;
  readonly base: HTMLElement;
  readonly nub: HTMLElement;
}

export interface JoysticksCallbacks {
  /** Axes échantillonnés (~30 Hz) — sink `pairingHost.sendInput` (SAB local OU RTC). */
  readonly onInput: (dirX: number, dirZ: number) => void;
  /** START pressé — lance la partie (PLAY + sync du peer). */
  readonly onStart: () => void;
}

/**
 * Joysticks **dynamiques** en DOM : la moitié gauche/droite de l'écran est une zone tactile ; le
 * joystick apparaît **sous le pouce** là où le joueur touche, et se replace si le pouce se relève
 * et repose ailleurs. Deux pouces indépendants. Échantillonne à ~30 Hz et pousse les axes au sink.
 * Bouton START (état `ready`, ex. controller après pairing). Remplace le `GamepadScreen` Pixi ;
 * transparent sur le canvas (le jeu/solo est rendu derrière).
 */
export class Joysticks {
  private readonly _surface: HTMLElement;
  private readonly _startBtn: HTMLButtonElement;
  private readonly _left: Side;
  private readonly _right: Side;
  private readonly _cb: JoysticksCallbacks;

  private _active = false;
  private _raf = 0;
  private _sampleAcc = 0;
  private _keepaliveAcc = 0;
  private _lastTs = 0;
  private _seqX = 0;
  private _seqZ = 0;

  constructor(root: HTMLElement, cb: JoysticksCallbacks) {
    this._cb = cb;

    this._surface = document.createElement('div');
    this._surface.className = 'shell-joysticks';
    this._left = this._makeSide();
    this._right = this._makeSide();
    this._surface.append(this._left.base, this._left.nub, this._right.base, this._right.nub);

    this._startBtn = document.createElement('button');
    this._startBtn.className = 'shell-start';
    this._startBtn.textContent = 'START';
    this._startBtn.addEventListener('click', () => this._cb.onStart());

    root.append(this._surface, this._startBtn);

    this._surface.addEventListener('pointerdown', (e) => this._onDown(e));
    this._surface.addEventListener('pointermove', (e) => this._onMove(e));
    this._surface.addEventListener('pointerup', (e) => this._onUp(e));
    this._surface.addEventListener('pointercancel', (e) => this._onUp(e));
  }

  /** Affiche/masque le bouton START (état `ready`). */
  showStart(visible: boolean): void {
    this._startBtn.classList.toggle('shell-start--visible', visible);
  }

  /** Active/désactive la surface joysticks (état `playing`). Zéro les axes en sortie. */
  setActive(active: boolean): void {
    if (active === this._active) return;
    this._active = active;
    this._surface.classList.toggle('shell-joysticks--active', active);
    if (active) {
      this._lastTs = performance.now();
      this._raf = requestAnimationFrame((t) => this._tick(t));
    } else {
      cancelAnimationFrame(this._raf);
      this._releaseSide(this._left);
      this._releaseSide(this._right);
      this._send(0, 0, true); // pas d'axes fantômes en quittant (§A.6)
    }
  }

  private _makeSide(): Side {
    const base = document.createElement('div');
    base.className = 'shell-stick-base';
    const nub = document.createElement('div');
    nub.className = 'shell-stick-nub';
    return { pointerId: null, baseX: 0, baseY: 0, sample: sampleStick(0, 0, MAX_RADIUS), base, nub };
  }

  private _sideFor(e: PointerEvent): Side {
    return e.clientX < window.innerWidth / 2 ? this._left : this._right;
  }

  private _onDown(e: PointerEvent): void {
    const side = this._sideFor(e);
    if (side.pointerId !== null) return; // ce pouce est déjà pris
    side.pointerId = e.pointerId;
    side.baseX = e.clientX;
    side.baseY = e.clientY;
    this._surface.setPointerCapture(e.pointerId);
    this._placeBase(side);
    this._update(side, e.clientX, e.clientY);
  }

  private _onMove(e: PointerEvent): void {
    const side = e.pointerId === this._left.pointerId ? this._left : e.pointerId === this._right.pointerId ? this._right : null;
    if (side === null) return;
    this._update(side, e.clientX, e.clientY);
  }

  private _onUp(e: PointerEvent): void {
    const side = e.pointerId === this._left.pointerId ? this._left : e.pointerId === this._right.pointerId ? this._right : null;
    if (side === null) return;
    this._releaseSide(side);
  }

  private _update(side: Side, x: number, y: number): void {
    side.sample = sampleStick(x - side.baseX, y - side.baseY, MAX_RADIUS);
    side.nub.style.transform = `translate(${side.baseX + side.sample.nubX}px, ${side.baseY + side.sample.nubY}px)`;
  }

  private _placeBase(side: Side): void {
    side.base.style.transform = `translate(${side.baseX}px, ${side.baseY}px)`;
    side.base.classList.add('shell-stick-base--visible');
    side.nub.classList.add('shell-stick-nub--visible');
  }

  private _releaseSide(side: Side): void {
    if (side.pointerId !== null && this._surface.hasPointerCapture(side.pointerId)) {
      this._surface.releasePointerCapture(side.pointerId);
    }
    side.pointerId = null;
    side.sample = sampleStick(0, 0, MAX_RADIUS);
    side.base.classList.remove('shell-stick-base--visible');
    side.nub.classList.remove('shell-stick-nub--visible');
  }

  private _tick(ts: number): void {
    if (!this._active) return;
    const delta = ts - this._lastTs;
    this._lastTs = ts;
    this._sampleAcc += delta;
    this._keepaliveAcc += delta;
    if (this._sampleAcc >= SAMPLE_MS) {
      this._sampleAcc = 0;
      const reduced = reduceSticks(this._left.sample, this._right.sample);
      const qx = quant(reduced.x);
      const qz = quant(reduced.z);
      const changed = qx !== this._seqX || qz !== this._seqZ;
      if (changed || this._keepaliveAcc >= KEEPALIVE_MS) this._send(reduced.x, reduced.z, changed);
    }
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  private _send(x: number, z: number, changed: boolean): void {
    this._cb.onInput(x, z);
    if (changed) {
      this._seqX = quant(x);
      this._seqZ = quant(z);
    }
    this._keepaliveAcc = 0;
  }
}
