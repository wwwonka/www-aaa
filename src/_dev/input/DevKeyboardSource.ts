// Source d'input DEV — clavier WASD/flèches → les DEUX sticks (même direction : la locomotion
// exige deux sticks actifs, le clavier émule deux pouces parallèles). Miroir de `src/input/sources/` mais dans
// `_dev/` : le jeu ne se contrôle PAS au clavier en prod (vision console-sur-web). Enregistrée dans le
// hub uniquement via `initDev` (`?dev`), jamais par le pipeline prod. Reprend la logique de l'ancien
// `attachKeyboardSimControls`, mais en `InputSource` : elle emprunte le même hub → SAB que la manette.

import type { InputSource } from '../../input/sources/InputSource';
import { createControllerFrame, type ControllerFrame } from '../../input/ControllerFrame';

export class DevKeyboardSource implements InputSource {
  readonly kind = 'keyboard';

  private readonly _frame = createControllerFrame();
  private readonly _pressed = new Set<string>();
  private _started = false;

  private readonly _onKeyDown = (e: KeyboardEvent): void => {
    this._pressed.add(e.code);
  };
  private readonly _onKeyUp = (e: KeyboardEvent): void => {
    this._pressed.delete(e.code);
  };
  private readonly _onBlur = (): void => {
    this._pressed.clear();
  };

  start(): void {
    if (this._started) return;
    this._started = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    this._pressed.clear();
  }

  poll(): ControllerFrame | null {
    let x = 0;
    let z = 0;
    if (this._pressed.has('KeyA') || this._pressed.has('ArrowLeft')) x -= 1;
    if (this._pressed.has('KeyD') || this._pressed.has('ArrowRight')) x += 1;
    if (this._pressed.has('KeyW') || this._pressed.has('ArrowUp')) z += 1;
    if (this._pressed.has('KeyS') || this._pressed.has('ArrowDown')) z -= 1;
    if (x === 0 && z === 0) return null; // désengagée — le hub la sort de l'arbitrage
    if (x !== 0 && z !== 0) {
      // Diagonale : normalise pour ne pas dépasser la vitesse d'un axe (comme l'ancien clavier dev).
      const inv = 1 / Math.SQRT2;
      x *= inv;
      z *= inv;
    }
    this._frame.leftStick.x = x;
    this._frame.leftStick.z = z;
    this._frame.rightStick.x = x;
    this._frame.rightStick.z = z;
    return this._frame;
  }
}
