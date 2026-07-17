// Source tactile — le **contrôleur** des joysticks virtuels. Contient TOUTE la logique : capture
// des events pointer, détection du côté (moitié gauche/droite = deux pouces indépendants),
// échantillonnage via `sampleStick` (axes + offset pixel du nub). Elle ne connaît aucune classe
// CSS : elle pilote une vue « bête » via `JoystickVisual` (interface définie ICI ; le shell
// l'implémente — inversion de dépendance, `input/` n'importe jamais le shell). L'ancien
// `Joysticks._tick` (cadence 30 Hz + envoi) disparaît : la cadence appartient à l'InputHub.

import type { InputSource } from './InputSource';
import { createControllerFrame, type ControllerFrame } from '../ControllerFrame';
import { sampleStick, type StickSample } from '../math/stickMath';

const MAX_RADIUS = 70; // rayon max du déplacement du nub (px)

/** Les deux moitiés de l'écran, un pouce chacune. */
export type StickSide = 'left' | 'right';

/**
 * Vue passive des joysticks, implémentée par le shell (DOM/CSS). La `TouchSource` lui donne des
 * ordres de dessin en pixels écran ; la vue ne fait qu'appliquer des `transform`, jamais de calcul.
 */
export interface JoystickVisual {
  /** Positionne et révèle la base d'un stick au point écran donné (le pouce vient de se poser). */
  place(side: StickSide, baseX: number, baseY: number): void;
  /** Déplace le nub au point écran donné (base + offset borné). */
  moveNub(side: StickSide, x: number, y: number): void;
  /** Masque un stick (le pouce s'est relevé). */
  hide(side: StickSide): void;
}

interface Thumb {
  pointerId: number | null;
  baseX: number;
  baseY: number;
  sample: StickSample;
}

const neutralThumb = (): Thumb => ({
  pointerId: null,
  baseX: 0,
  baseY: 0,
  sample: sampleStick(0, 0, MAX_RADIUS),
});

export class TouchSource implements InputSource {
  readonly kind = 'touch';

  private readonly _frame = createControllerFrame();
  private readonly _left = neutralThumb();
  private readonly _right = neutralThumb();
  private readonly _surface: HTMLElement;
  private readonly _visual: JoystickVisual;
  private _started = false;

  /**
   * @param surface - L'élément plein écran qui capte les pointeurs (fourni par la vue shell).
   * @param visual - La vue à piloter (dessin du nub/base). Voir {@link JoystickVisual}.
   */
  constructor(surface: HTMLElement, visual: JoystickVisual) {
    this._surface = surface;
    this._visual = visual;
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this._surface.addEventListener('pointerdown', this._onDown);
    this._surface.addEventListener('pointermove', this._onMove);
    this._surface.addEventListener('pointerup', this._onUp);
    this._surface.addEventListener('pointercancel', this._onUp);
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    this._surface.removeEventListener('pointerdown', this._onDown);
    this._surface.removeEventListener('pointermove', this._onMove);
    this._surface.removeEventListener('pointerup', this._onUp);
    this._surface.removeEventListener('pointercancel', this._onUp);
    this._release(this._left, 'left');
    this._release(this._right, 'right');
  }

  poll(): ControllerFrame | null {
    // Désengagée si aucun pouce n'est posé — le hub la sort alors de l'arbitrage (pas d'axe fantôme).
    if (this._left.pointerId === null && this._right.pointerId === null) return null;
    this._frame.leftStick.x = this._left.sample.x;
    this._frame.leftStick.z = this._left.sample.z;
    this._frame.rightStick.x = this._right.sample.x;
    this._frame.rightStick.z = this._right.sample.z;
    return this._frame;
  }

  private readonly _onDown = (e: PointerEvent): void => {
    const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
    const thumb = side === 'left' ? this._left : this._right;
    if (thumb.pointerId !== null) return; // ce pouce est déjà pris
    thumb.pointerId = e.pointerId;
    thumb.baseX = e.clientX;
    thumb.baseY = e.clientY;
    this._surface.setPointerCapture(e.pointerId);
    this._visual.place(side, e.clientX, e.clientY);
    this._update(thumb, side, e.clientX, e.clientY);
  };

  private readonly _onMove = (e: PointerEvent): void => {
    const side = this._sideOf(e.pointerId);
    if (side === null) return;
    this._update(side === 'left' ? this._left : this._right, side, e.clientX, e.clientY);
  };

  private readonly _onUp = (e: PointerEvent): void => {
    const side = this._sideOf(e.pointerId);
    if (side === null) return;
    this._release(side === 'left' ? this._left : this._right, side);
  };

  private _sideOf(pointerId: number): StickSide | null {
    if (pointerId === this._left.pointerId) return 'left';
    if (pointerId === this._right.pointerId) return 'right';
    return null;
  }

  private _update(thumb: Thumb, side: StickSide, x: number, y: number): void {
    thumb.sample = sampleStick(x - thumb.baseX, y - thumb.baseY, MAX_RADIUS);
    this._visual.moveNub(side, thumb.baseX + thumb.sample.nubX, thumb.baseY + thumb.sample.nubY);
  }

  private _release(thumb: Thumb, side: StickSide): void {
    if (thumb.pointerId !== null && this._surface.hasPointerCapture(thumb.pointerId)) {
      this._surface.releasePointerCapture(thumb.pointerId);
    }
    thumb.pointerId = null;
    thumb.sample = sampleStick(0, 0, MAX_RADIUS);
    this._visual.hide(side);
  }
}
