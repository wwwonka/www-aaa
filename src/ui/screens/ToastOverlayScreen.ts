import { UIScreen } from '../UIScreen';
import { ToastPanel } from '../panels/ToastPanel';
import { loadFont } from '../../render/assets/loadAsset';

/**
 * Overlay des toasts/notifications. Contrairement aux autres screens il n'est PAS enregistré
 * dans `ScreenManager` (il n'est lié à aucun `AppState`) : `RenderManager` l'attache à la couche
 * `notificationUI` (layer4, au-dessus de tout) au boot, le tient toujours visible et pompe son
 * `update()` chaque frame. Le slide/timing vit dans `ToastPanel`.
 */
export class ToastOverlayScreen extends UIScreen {
  // Jamais consommé par ScreenManager (voir ci-dessus) — requis par le contrat UIScreen.
  readonly layer = 'overlayUI' as const;
  override readonly isOverlay = true;

  private readonly _panel: ToastPanel;

  private constructor(width: number, height: number, panel: ToastPanel) {
    super(width, height);
    this._panel = panel;
    // Toujours visible et jamais bloquant : les cartes n'ont aucune interaction et l'overlay ne
    // doit pas voler les events pointeur des screens en dessous.
    this.node.alpha = 1;
    this.node.eventMode = 'none';
    this.node.addChild(panel.node);
  }

  /** Charge fezbox dans le `FontFaceSet` du worker avant la première carte (même pattern que `PairingPanel`). */
  static async create(width: number, height: number): Promise<ToastOverlayScreen> {
    const face = await loadFont('fezbox.otf');
    (self as unknown as WorkerGlobalScope & { fonts: FontFaceSet }).fonts.add(face);
    return new ToastOverlayScreen(width, height, new ToastPanel(width));
  }

  /** @param message - Texte du toast (affiché en majuscules, mis en file si un toast est déjà visible). */
  show(message: string): void {
    this._panel.show(message);
  }

  override update(delta: number): void {
    this._panel.update(delta);
  }

  protected _onResize(width: number): void {
    this._panel.resize(width);
  }
}
