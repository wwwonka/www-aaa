// Redimensionnement de la fenêtre au pinch trackpad — les coins « glissent » vers
// l'extérieur/intérieur en gardant le centre fixe et le ratio d'aspect constant (façon IINA
// sur macOS). Symétrique de `AppWindowDrag` : un seul jeu de listeners sur `document` en
// phase capture, retourne un `dispose()` pour un tear-down propre.
//
// Chromium mappe le pinch trackpad (et le pinch tactile Windows) sur un `wheel` avec
// `ctrlKey: true` — le même signal que le zoom-page au clavier Ctrl+molette. On ne traite
// donc que `e.ctrlKey`, et on `preventDefault()` pour neutraliser le zoom-page natif (indésiré
// dans une PWA de jeu). Chromium PWA desktop uniquement : `window.resizeTo`/`moveTo` ne
// fonctionnent pas sur un onglet ordinaire — c'est à l'appelant (`setupPwaExperience`) de ne
// câbler ceci que pour `pwa-desktop-chromium`.
//
// Clé anti-lag : on capture la géométrie de la fenêtre (origine + taille) UNE SEULE FOIS au
// début du geste et on accumule un facteur d'échelle en log-space ; on ne relit jamais
// `window.outerWidth`/`screenX` en cours de geste. La tentative précédente recalculait le
// centre à chaque frame depuis la fenêtre en train de bouger — boucle de rétroaction avec le
// resize asynchrone → jank. Ici la fenêtre cible est une pure fonction de l'état de départ.
//
// NB : un lissage (easing) a été essayé mais retiré — `window.resizeTo` est throttlé par
// Chromium, donc les frames intermédiaires de l'easing ajoutent des appels qui se battent
// contre le throttle et saccadent AU LIEU de lisser. Un resize direct par event est plus
// réactif ici. Le vrai levier de fluidité restant est le gating du resize worker (churn GPU) —
// séparé, non implémenté pour l'instant.
import { acquireGesture, releaseGesture } from './windowGestureLock'

// Un « clic » de log-échelle par unité de delta. Réglé pour un pinch trackpad doux.
// - Plus grand (ex. 0.02) → grossit/rétrécit plus vite ; plus « nerveux », plus dur à doser.
// - Plus petit (ex. 0.005) → plus lent et précis, il faut pincer plus pour le même effet.
const SCALE_SENSITIVITY = 0.005
// Un pinch trackpad envoie des deltas de ±1-10 ; une molette Ctrl (souris) de ±100. Sans
// borne, un cran de molette ferait sauter la fenêtre — on clampe chaque event.
const DELTA_CLAMP = 40
// Pas d'event « fin de pinch » natif : geste considéré terminé après ce délai sans nouvel event.
const END_TIMEOUT_MS = 180

// Plancher dur imposé par Chromium sur la taille des fenêtres top-level (PWA installée comprise) :
// `resizeTo()` en-dessous est silencieusement clampé. Si on demandait une taille sous ce plancher,
// `moveTo` (calculé sur la taille *demandée*) et la largeur *réelle* (bloquée au plancher) se
// désynchroniseraient et la fenêtre glisserait latéralement. On clampe donc l'échelle au plancher.
// Valeurs observées sur macOS ; statiques (une auto-calibration a été essayée mais retirée : lue
// pendant un resize async, elle apprenait un faux plancher gonflé et empêchait de resize petit).
const FLOOR_MIN_W = 500
const FLOOR_MIN_H = 362

interface PinchState {
  x0:       number
  y0:       number
  w0:       number
  h0:       number
  logScale: number
}

export function setupWindowPinch(): () => void {
  let pinch: PinchState | null = null
  let rafId = 0
  let endTimer = 0
  // Dernière géométrie appliquée — garde d'idempotence pour éviter des `moveTo`/`resizeTo`
  // redondants quand le calcul retombe sur les mêmes pixels.
  let lastW = 0
  let lastH = 0
  let lastX = 0
  let lastY = 0

  const apply = () => {
    rafId = 0
    if (!pinch) return

    // Clampe l'échelle au plancher Chromium (ratio préservé) : on ne demande jamais une taille
    // que Chromium clamperait, ce qui garderait `moveTo` et `resizeTo` désynchronisés.
    const sMin = Math.max(FLOOR_MIN_W / pinch.w0, FLOOR_MIN_H / pinch.h0)
    const s = Math.max(sMin, Math.exp(pinch.logScale))
    const w = Math.round(pinch.w0 * s)
    const h = Math.round(pinch.h0 * s)

    // Les coins bougent symétriquement → l'origine se décale de la moitié du delta de taille,
    // ce qui laisse le centre de la fenêtre fixe. Le ratio d'aspect est préservé car w et h
    // partent de w0/h0 avec le même facteur s.
    const x = Math.round(pinch.x0 + (pinch.w0 - w) / 2)
    const y = Math.round(pinch.y0 + (pinch.h0 - h) / 2)

    if (w === lastW && h === lastH && x === lastX && y === lastY) return
    lastW = w; lastH = h; lastX = x; lastY = y

    window.moveTo(x, y)
    window.resizeTo(w, h)
  }

  const onWheel = (e: WheelEvent) => {
    // Seul le pinch trackpad / Ctrl+molette nous concerne ; rien à redimensionner en plein écran.
    if (!e.ctrlKey || document.fullscreenElement) return
    e.preventDefault()

    if (!pinch) {
      // Un drag clic-maintenu en cours tient le verrou — on n'ouvre pas de pinch qui se
      // battrait avec lui pour la position de la fenêtre.
      if (!acquireGesture('pinch')) return
      pinch = {
        x0:       window.screenX,
        y0:       window.screenY,
        w0:       window.outerWidth,
        h0:       window.outerHeight,
        logScale: 0,
      }
      lastW = pinch.w0; lastH = pinch.h0; lastX = pinch.x0; lastY = pinch.y0
    }

    // Accumulation en log-space : zoom-in et zoom-out sont symétriques.
    const delta = Math.max(-DELTA_CLAMP, Math.min(DELTA_CLAMP, e.deltaY))
    pinch.logScale -= delta * SCALE_SENSITIVITY

    // Un seul resize par frame, quel que soit le nombre d'events reçus.
    if (!rafId) rafId = requestAnimationFrame(apply)

    // Réarme le timer de fin à chaque event — libère le verrou une fois le geste terminé.
    clearTimeout(endTimer)
    endTimer = window.setTimeout(() => {
      pinch = null
      releaseGesture('pinch')
    }, END_TIMEOUT_MS)
  }

  document.addEventListener('wheel', onWheel, { capture: true, passive: false })

  return function dispose() {
    document.removeEventListener('wheel', onWheel, { capture: true })
    if (rafId) cancelAnimationFrame(rafId)
    clearTimeout(endTimer)
    if (pinch) releaseGesture('pinch')
  }
}
