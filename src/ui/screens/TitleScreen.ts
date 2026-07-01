import { UIScreen } from '../UIScreen'
import { TitleMenuPanel } from '../panels/TitleMenuPanel'

export class TitleScreen extends UIScreen {
  readonly layer = 'overlayUI' as const

  private constructor(width: number, height: number, panel: TitleMenuPanel) {
    super(width, height)
    // Chaque sous-composant (title, connectController) contrôle sa propre opacité via
    // AnimationRegistry (voir TextLabel) — le screen lui-même reste visible en permanence pour
    // ne pas masquer un fade indépendant par sous-composant.
    this.node.alpha = 1
    this.node.addChild(panel.node)
  }

  /** Awaits `TitleMenuPanel.create()` (loads fezbox) before the screen ever exists — no fallback-font flash. */
  static async create(width: number, height: number): Promise<TitleScreen> {
    const panel = await TitleMenuPanel.create(() => {
      // TODO: embranchement mobile — pour l'instant un simple point d'entrée cliquable.
    })
    return new TitleScreen(width, height, panel)
  }

  onEnter(): void {
    this.node.eventMode = 'passive'
  }

  onLeave(): void {
    this.node.eventMode = 'none'
  }

  update(): void {
    // no-op — alpha piloté par sous-composant via AnimationRegistry, pas par le tween easeIn/easeOut d'UIScreen.
  }

  protected onResize(): void {
    // no-op — la position du panel est entièrement gérée par le layout flex d'UIScreen.
  }
}
