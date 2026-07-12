const SLIDE_MS = 280;
const HOLD_MS = 2500;

/**
 * Toast DOM (notifications) : slide-in depuis le haut, tient `HOLD_MS`, slide-out. File d'attente —
 * un seul visible à la fois, les suivants attendent. Équivalent DOM de l'ancien `ToastPanel` Pixi.
 */
export class Toast {
  private readonly _root: HTMLElement;
  private readonly _queue: string[] = [];
  private _el: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this._root = root;
  }

  /** Empile un toast — affiché immédiatement si aucun n'est en cours. */
  show(message: string): void {
    this._queue.push(message);
    if (this._el === null) this._next();
  }

  private _next(): void {
    const message = this._queue.shift();
    if (message === undefined) return;

    const el = document.createElement('div');
    el.className = 'shell-toast';
    el.textContent = message.toUpperCase();
    this._root.appendChild(el);
    this._el = el;

    // Reflow forcé avant d'ajouter la classe → la transition CSS joue (slide-in).
    void el.offsetHeight;
    el.classList.add('shell-toast--visible');

    window.setTimeout(() => this._dismiss(), SLIDE_MS + HOLD_MS);
  }

  private _dismiss(): void {
    const el = this._el;
    if (el === null) return;
    el.classList.remove('shell-toast--visible');
    window.setTimeout(() => {
      el.remove();
      this._el = null;
      this._next();
    }, SLIDE_MS);
  }
}
