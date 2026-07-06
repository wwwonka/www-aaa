import { Container } from 'pixi.js';
import { UIComponent } from '../UIComponent';
import { ToastCard } from '../components/ToastCard';
import { easeIn, easeOut } from '../layout';

const SLIDE_MS = 280;
const HOLD_MS = 2500;
const TOP_MARGIN_PX = 28;

type ToastPhase = 'in' | 'hold' | 'out';

/**
 * File des toasts actifs : un seul visible à la fois, les suivants attendent leur tour.
 * Anime le slide-in depuis le haut de l'écran, tient `HOLD_MS`, puis slide-out symétrique.
 * La présentation (couche notifications, cycle update) appartient à `ToastOverlayScreen`.
 */
export class ToastPanel extends UIComponent {
  readonly node: Container = new Container();

  private _viewportWidth: number;
  private readonly _queue: string[] = [];
  private _card: ToastCard | null = null;
  private _phase: ToastPhase | null = null;
  private _elapsed = 0;

  /** @param viewportWidth - Largeur du viewport, pour centrer les cartes horizontalement. */
  constructor(viewportWidth: number) {
    super();
    this._viewportWidth = viewportWidth;
  }

  /** Empile un toast — affiché immédiatement si aucun n'est en cours. */
  show(message: string): void {
    this._queue.push(message);
    if (this._card === null) this._next();
  }

  /** @param delta - Temps écoulé depuis la dernière frame, en millisecondes. */
  update(delta: number): void {
    if (this._card === null || this._phase === null) return;
    this._elapsed += delta;

    if (this._phase === 'hold') {
      if (this._elapsed >= HOLD_MS) this._enterPhase('out');
      return;
    }

    const t = Math.min(this._elapsed / SLIDE_MS, 1);
    const progress = this._phase === 'in' ? easeOut(t) : 1 - easeIn(t);
    this._card.node.y = -this._card.heightPx + (this._card.heightPx + TOP_MARGIN_PX) * progress;

    if (t < 1) return;
    if (this._phase === 'in') {
      this._enterPhase('hold');
    } else {
      this._card.node.destroy({ children: true });
      this._card = null;
      this._next();
    }
  }

  /** @param viewportWidth - Nouvelle largeur du viewport, en pixels. */
  resize(viewportWidth: number): void {
    this._viewportWidth = viewportWidth;
    if (this._card) this._card.node.x = (viewportWidth - this._card.widthPx) / 2;
  }

  private _next(): void {
    const message = this._queue.shift();
    if (message === undefined) {
      this._phase = null;
      return;
    }
    const card = new ToastCard(message);
    card.node.x = (this._viewportWidth - card.widthPx) / 2;
    card.node.y = -card.heightPx;
    this.node.addChild(card.node);
    this._card = card;
    this._enterPhase('in');
  }

  private _enterPhase(phase: ToastPhase): void {
    this._phase = phase;
    this._elapsed = 0;
  }
}
