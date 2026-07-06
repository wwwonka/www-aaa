// Rempart contre le zoom-page natif de Chromium — CRITIQUE et indépendant du reste.
//
// `ctrl+wheel` (et le pinch trackpad, que Chromium mappe dessus) déclenche le zoom-page qui met
// à l'échelle le CONTENU du canvas ; une fois zoomé, Chromium mémorise le niveau → impossible de
// revenir sans Ctrl+0. `AppWindowPinch` fait déjà `preventDefault`, mais il peut céder le pas
// (bail en plein écran, verrou non tenu, préemption…) et laisser un event passer. Ce module est
// le garde-fou « à tout prix » : un seul listener toujours actif, sans état, qui neutralise TOUT
// zoom-page, quoi qu'il arrive ailleurs.
//
// Chromium PWA desktop uniquement (câblé par `setupPwaExperience`) : ailleurs le zoom page est un
// comportement navigateur légitime qu'on ne veut pas casser.
//
// Retourne un `dispose()`, en symétrie avec les autres handlers.

// Touches qui, avec Ctrl/⌘, déclenchent le zoom clavier : '+', '-', '=' (+ sans shift), '0' (reset).
const ZOOM_KEYS = new Set(['+', '-', '=', '0'])

export function setupPreventPageZoom(): () => void {
  // `passive: false` est obligatoire pour que `preventDefault` puisse annuler le zoom molette.
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ZOOM_KEYS.has(e.key)) e.preventDefault()
  }

  window.addEventListener('wheel', onWheel, { capture: true, passive: false })
  window.addEventListener('keydown', onKeyDown, { capture: true })

  return function dispose() {
    window.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('keydown', onKeyDown, { capture: true })
  }
}
