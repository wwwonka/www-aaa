/**
 * Gate d'orientation DOM (mobile) : overlay plein écran « ROTATE TO LANDSCAPE », réactif. iOS Safari
 * ne peut pas verrouiller l'orientation en onglet → ce prompt visuel est la seule option.
 * Équivalent DOM de l'ancien `RotateScreen` Pixi. `setActive` le montre/cache (fondu CSS).
 */
export class RotateGate {
  private readonly _el: HTMLElement;

  constructor(root: HTMLElement) {
    this._el = document.createElement('div');
    this._el.className = 'shell-rotate';

    const phone = document.createElement('div');
    phone.className = 'shell-rotate__phone';

    const title = document.createElement('div');
    title.className = 'shell-rotate__title';
    title.textContent = 'ROTATE TO LANDSCAPE';

    const hint = document.createElement('div');
    hint.className = 'shell-rotate__hint';
    hint.textContent = 'TURN YOUR DEVICE SIDEWAYS TO PLAY';

    this._el.append(phone, title, hint);
    root.appendChild(this._el);
  }

  /** Montre/cache le gate (portrait && en jeu, piloté par `ShellHost`). Idempotent. */
  setActive(active: boolean): void {
    this._el.classList.toggle('shell-rotate--active', active);
  }
}
