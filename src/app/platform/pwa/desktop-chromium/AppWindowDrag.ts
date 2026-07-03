// Déplacement de la fenêtre par clic-drag n'importe où sur la surface — port TS du
// `initGlobalWindowDrag` éprouvé de l'ancienne PWA, adapté au canvas unique.
//
// Un seul jeu de listeners sur `document` en phase capture (rien en aval ne peut nous
// cacher un appui via stopPropagation), pas un par élément : comme le `click` natif ne se
// déclenche jamais quand le pointeur a bougé au-delà d'un seuil, chaque bouton Pixi continue
// de fonctionner sans câblage supplémentaire — un clic simple reste un clic, seul un vrai
// drag déplace la fenêtre.
//
// Chromium PWA uniquement : `window.moveTo()` ne fonctionne pas sur un onglet ordinaire, et
// les PWA Firefox/Safari ont déjà une barre de titre OS native déplaçable. C'est à l'appelant
// (`setupPwaExperience`) de ne câbler ceci que pour `pwa-desktop-chromium`.
//
// Retourne un `dispose()` (et non l'inverse) pour un tear-down propre, en symétrie avec les
// autres handlers d'événements du shell.

import { acquireGesture, releaseGesture } from './windowGestureLock'

const DRAG_THRESHOLD_PX = 4

interface DragState {
  pointerId:   number
  target:      EventTarget & { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void }
  startScreenX: number
  startScreenY: number
  startWinX:    number
  startWinY:    number
  moved:        boolean
}

export function setupWindowDrag(): () => void {
  let drag: DragState | null = null
  let suppressNextClick = false

  const onPointerDown = (e: PointerEvent) => {
    // Pas de drag au clic droit ni en plein écran (rien à déplacer).
    if (e.button !== 0 || document.fullscreenElement) return
    // Un pinch trackpad en cours tient le verrou — on n'ouvre pas un drag qui se battrait
    // avec lui pour la position de la fenêtre.
    if (!acquireGesture('drag')) return
    drag = {
      pointerId:    e.pointerId,
      target:       e.target as DragState['target'],
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startWinX:    window.screenX,
      startWinY:    window.screenY,
      moved:        false,
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const dx = e.screenX - drag.startScreenX
    const dy = e.screenY - drag.startScreenY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    if (!drag.moved) drag.target.setPointerCapture?.(drag.pointerId)
    drag.moved = true
    suppressNextClick = true
    window.moveTo(drag.startWinX + dx, drag.startWinY + dy)
  }

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (drag.moved) drag.target.releasePointerCapture?.(drag.pointerId)
    drag = null
    releaseGesture('drag')
  }

  // Annule exactement le `click` qui suivrait le drag qu'on vient de terminer, puis se
  // réarme — le prochain vrai clic (un appui qui n'a pas bougé) n'est pas touché.
  const onClick = (e: MouseEvent) => {
    if (!suppressNextClick) return
    suppressNextClick = false
    e.preventDefault()
    e.stopPropagation()
  }

  document.addEventListener('pointerdown', onPointerDown, { capture: true })
  document.addEventListener('pointermove', onPointerMove, { capture: true })
  document.addEventListener('pointerup', endDrag, { capture: true })
  document.addEventListener('pointercancel', endDrag, { capture: true })
  document.addEventListener('click', onClick, { capture: true })

  return function dispose() {
    document.removeEventListener('pointerdown', onPointerDown, { capture: true })
    document.removeEventListener('pointermove', onPointerMove, { capture: true })
    document.removeEventListener('pointerup', endDrag, { capture: true })
    document.removeEventListener('pointercancel', endDrag, { capture: true })
    document.removeEventListener('click', onClick, { capture: true })
    if (drag) releaseGesture('drag')
  }
}
