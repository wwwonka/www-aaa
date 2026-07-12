import { UIScreen } from '../UIScreen';
import { TitleMenuPanel } from '../panels/TitleMenuPanel';
import { playAnimation } from '../../render/animation/AnimationPlayer';

/** The game's title/attract screen — subcomponents fade in independently via Theatre.js-authored (or hand-baked) animation, triggered from {@link TitleScreen.onEnter}. */
export class TitleScreen extends UIScreen {
  readonly layer = 'overlayUI' as const;

  private readonly _panel: TitleMenuPanel;

  private constructor(width: number, height: number, panel: TitleMenuPanel) {
    super(width, height);
    this._panel = panel;
    // Chaque sous-composant (title, connectController) contrôle sa propre opacité via
    // AnimationRegistry (voir TextLabel) — le screen lui-même reste visible en permanence pour
    // ne pas masquer un fade indépendant par sous-composant.
    this.node.alpha = 1;
    this.node.addChild(panel.node);
  }

  /**
   * Awaits `TitleMenuPanel.create()` (loads fezbox) before the screen ever exists — no fallback-font flash.
   *
   * @param onConnectController - Click handler du prompt "CONNECT CONTROLLER" — remonte
   * `OPEN_PAIRING` à l'orchestrateur (voir `RenderManager.setSendToAsm`).
   * @param onPlay - Click handler du prompt "START GAME" (controller pairé) — remonte `PLAY`.
   */
  static async create(
    width: number,
    height: number,
    onConnectController: () => void,
    onPlay: () => void,
    onUseAsController?: () => void,
  ): Promise<TitleScreen> {
    const panel = await TitleMenuPanel.create({ onConnectController, onPlay, onUseAsController });
    return new TitleScreen(width, height, panel);
  }

  /** Miroir de l'état pairé — bascule le prompt du menu (voir `TitleMenuPanel.setControllerConnected`). */
  setControllerConnected(connected: boolean): void {
    this._panel.setControllerConnected(connected);
  }

  // Override complet (pas de `super.onEnter()`) — ce screen n'utilise pas le tween fade
  // easeIn/easeOut par défaut d'UIScreen, chaque sous-composant pilote sa propre opacité via
  // AnimationRegistry. C'est ici, et nulle part ailleurs (pas RenderManager), que ce screen
  // déclenche sa propre animation — idempotent, donc sûr à ré-invoquer (voir ScreenManager.replayCurrentReveal).
  onEnter(): void {
    this.node.visible = true;
    this.node.eventMode = 'passive';
    void playAnimation('title-screen');
  }

  onLeave(): void {
    // Les alphas des sous-composants restent pilotés par l'AnimationRegistry — on masque le
    // node entier, sinon le title reste affiché par-dessus le jeu.
    this.node.visible = false;
    this.node.eventMode = 'none';
  }

  update(): void {
    // no-op — alpha piloté par sous-composant via AnimationRegistry, pas par le tween easeIn/easeOut d'UIScreen.
  }

  protected _onResize(): void {
    // no-op — la position du panel est entièrement gérée par le layout flex d'UIScreen.
  }
}
