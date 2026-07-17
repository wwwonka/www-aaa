// Source manette — **agnostique** par construction : on lit le mapping W3C `"standard"` (axes 0/1 =
// stick gauche, 2/3 = stick droit, positions fixes identiques DS4 / Xbox / Joy-Con…), jamais une
// table par marque. La Gamepad API n'a pas d'events de valeur : on *poll* `getGamepads()` une fois
// par tick (via l'InputHub). Park-on-connect : sans manette branchée, `poll()` ne fait rien.
// Passe « sticks d'abord » : les boutons ne sont pas encore lus (voir le plan §Séquences).

import type { InputSource } from './InputSource';
import { createControllerFrame, type ControllerFrame } from '../ControllerFrame';
import { radialDeadzone } from '../math/deadzone';

// Les sticks manette dérivent au repos (surtout usés) → deadzone un peu plus large que le tactile.
const GAMEPAD_DEADZONE = 0.12;

export class GamepadSource implements InputSource {
  readonly kind = 'gamepad';

  private readonly _frame = createControllerFrame();
  private _started = false;
  // Index de la manette suivie dans le tableau (creux) de `getGamepads()`. Les ids ne sont PAS
  // uniques (identifiant de marque, pas de périphérique) → on suit par index, pas par id.
  private _index: number | null = null;

  private readonly _onConnect = (e: GamepadEvent): void => {
    // Première manette « standard » branchée : on l'adopte. Le navigateur ne l'expose qu'après une
    // première interaction (raison pour laquelle l'event est le signal fiable, pas un scan au boot).
    if (this._index === null && e.gamepad.mapping === 'standard') this._index = e.gamepad.index;
  };

  private readonly _onDisconnect = (e: GamepadEvent): void => {
    if (e.gamepad.index === this._index) this._index = null;
  };

  start(): void {
    if (this._started) return;
    this._started = true;
    window.addEventListener('gamepadconnected', this._onConnect);
    window.addEventListener('gamepaddisconnected', this._onDisconnect);
    this._adoptAlreadyConnected();
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;
    window.removeEventListener('gamepadconnected', this._onConnect);
    window.removeEventListener('gamepaddisconnected', this._onDisconnect);
    this._index = null;
  }

  poll(): ControllerFrame | null {
    if (this._index === null) return null; // aucune manette → coût quasi nul
    const pad = navigator.getGamepads()[this._index];
    if (pad === null || pad.mapping !== 'standard') {
      this._index = null; // débranchée entre deux ticks, ou trou dans le tableau
      return null;
    }
    // Vertical manette : haut = -1 → on inverse pour la convention jeu (haut = +z), comme le tactile.
    const left = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, GAMEPAD_DEADZONE);
    const right = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, GAMEPAD_DEADZONE);
    this._frame.leftStick.x = left.x;
    this._frame.leftStick.z = -left.y;
    this._frame.rightStick.x = right.x;
    this._frame.rightStick.z = -right.y;
    return this._frame;
  }

  /** Manette déjà « active » au démarrage (ex. après navigation soft) : scan unique de secours. */
  private _adoptAlreadyConnected(): void {
    for (const pad of navigator.getGamepads()) {
      if (pad !== null && pad.mapping === 'standard') {
        this._index = pad.index;
        return;
      }
    }
  }
}
