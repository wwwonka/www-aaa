import type { RuntimeCategory } from '../runtimeDetect'
import { setupDblclickFullscreen } from './AppWindowFullscreen'
import { setupWindowDrag }         from './desktop-chromium/AppWindowDrag'
import { setupWindowPinch }        from './desktop-chromium/AppWindowPinch'

/**
 * Câble les comportements « chrome de fenêtre » selon le runtime détecté :
 * - double-clic → plein écran sur toutes les PWA desktop (chromium/firefox/safari) ;
 * - clic-drag → déplacement de la fenêtre, uniquement sur PWA desktop Chromium (seul contexte
 *   où `window.moveTo()` marche ; FF/Safari ont une barre de titre OS native déjà déplaçable) ;
 * - pinch trackpad → redimensionnement de la fenêtre depuis son centre, même contexte Chromium
 *   (seul où `window.resizeTo()` marche).
 *
 * En onglet navigateur ou en mobile : ne fait rien.
 *
 * @param isOverGameUI - Getter synchrone (miroir poussé par le render worker) indiquant si le
 *   curseur survole un contrôle Pixi interactif — voir `AppWindowFullscreen`.
 */
export function setupPwaExperience(runtime: RuntimeCategory, isOverGameUI: () => boolean): void {
  const isDesktopPwa =
    runtime === 'pwa-desktop-chromium' ||
    runtime === 'pwa-desktop-firefox' ||
    runtime === 'pwa-desktop-safari'

  if (isDesktopPwa) setupDblclickFullscreen(isOverGameUI)
  if (runtime === 'pwa-desktop-chromium') {
    setupWindowDrag()
    setupWindowPinch()
  }
}
