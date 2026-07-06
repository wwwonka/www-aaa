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
import { acquireGesture, releaseGesture, heldGesture } from './windowGestureLock'

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
// Nb de frames consécutives « axe bloqué » avant d'entériner un plancher réel — filtre les
// faux positifs de settling (voir `stuckW`/`stuckH` dans `apply`).
const FLOOR_CONFIRM_FRAMES = 3

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
  // Plancher réel APPRIS pendant le geste (échelle mini), quand Chromium refuse de rétrécir un
  // axe. Nos constantes `FLOOR_MIN_*` sont une borne basse de secours mais peuvent être SOUS le
  // vrai minimum machine/DPR ; sans ça, on demanderait un axe sous son plancher réel → Chromium
  // le clampe pendant que l'autre axe continue → scale mono-axe. Monotone (ne fait que monter),
  // remis à 0 à chaque nouveau geste. `prevOuter*` sert à distinguer un vrai plancher (taille
  // réelle stable) d'un simple retard de resize (taille réelle qui décroît frame après frame).
  let floorScale = 0
  let prevOuterW = 0
  let prevOuterH = 0
  // Nb de frames consécutives où un axe semble bloqué (réel > demandé, stable). On n'entérine un
  // plancher qu'après `FLOOR_CONFIRM_FRAMES` pour NE PAS confondre un vrai plancher (bloqué
  // indéfiniment) avec un reliquat de settling au renversement pinch-out→pinch-in (qui, lui, se
  // résorbe en 1-2 frames quand outerWidth redescend). Sinon on verrouillait un faux plancher à
  // la grande taille du pinch-out → impossible de rétrécir ensuite.
  let stuckW = 0
  let stuckH = 0
  // Vrai quand la fenêtre est à sa dimension minimale (échelle collée au plancher). Dans cet état
  // on IGNORE tout pinch-in supplémentaire (pas d'accumulation) — réactivé dès le premier pinch-out.
  let atFloor = false

  const apply = () => {
    rafId = 0
    if (!pinch) return
    // Un drag a préempté notre verrou (voir windowGestureLock) → on abandonne, il pilote la
    // position maintenant. Sans ça, drag et pinch écriraient tous deux la géométrie.
    if (heldGesture() !== 'pinch') { pinch = null; return }

    // Auto-détection du vrai plancher. Un axe est candidat quand la fenêtre RÉELLE est plus grande
    // que ce qu'on a demandé (`lastW/lastH` → Chromium a refusé de rétrécir) ET que la taille
    // réelle est stable (`prevOuter*`). Mais on n'entérine qu'après plusieurs frames consécutives
    // (`FLOOR_CONFIRM_FRAMES`) : un reliquat de settling au renversement pinch-out→pinch-in remplit
    // la condition 1 frame puis se résorbe (outerWidth redescend), tandis qu'un vrai plancher reste
    // bloqué. Une fois confirmé, `floorScale` (monotone) bloque les DEUX axes au prochain `sMin`
    // (aspect préservé). Lecture UNIQUEMENT pour le plancher — pas de boucle de rétroaction.
    const TOL = 2
    const aw = window.outerWidth
    const ah = window.outerHeight
    stuckW = (aw > lastW + TOL && Math.abs(aw - prevOuterW) <= TOL) ? stuckW + 1 : 0
    stuckH = (ah > lastH + TOL && Math.abs(ah - prevOuterH) <= TOL) ? stuckH + 1 : 0
    if (stuckW >= FLOOR_CONFIRM_FRAMES) floorScale = Math.max(floorScale, aw / pinch.w0)
    if (stuckH >= FLOOR_CONFIRM_FRAMES) floorScale = Math.max(floorScale, ah / pinch.h0)
    prevOuterW = aw; prevOuterH = ah

    // Centre de la fenêtre au début du geste — invariant : on le garde fixe pendant tout le pinch.
    const cx = pinch.x0 + pinch.w0 / 2
    const cy = pinch.y0 + pinch.h0 / 2

    // Zone d'écran disponible (CSS px). availLeft/availTop sont non-standard (absents du type
    // `Screen`) mais fournis par Chromium en multi-écran ; défaut 0.
    const scr = window.screen as Screen & { availLeft?: number; availTop?: number }
    const availLeft = scr.availLeft ?? 0
    const availTop  = scr.availTop  ?? 0

    // Bornes d'échelle, ratio préservé (w et h partent du même s) :
    // - sMin : plancher Chromium — en-dessous `resizeTo` est clampé et `moveTo`/`resizeTo` se
    //   désynchronisent (dérive).
    // - sMax : la fenêtre doit rester ENTIÈREMENT à l'écran avec le centre fixe — sinon, au bord,
    //   un axe est clampé par l'OS pendant que l'autre grandit → l'aspect se casse. On clampe donc
    //   les DEUX axes ensemble à ce qui tient à l'écran.
    const maxW = 2 * Math.min(cx - availLeft, availLeft + scr.availWidth  - cx)
    const maxH = 2 * Math.min(cy - availTop,  availTop  + scr.availHeight - cy)
    const sMin = Math.max(FLOOR_MIN_W / pinch.w0, FLOOR_MIN_H / pinch.h0, floorScale)
    const sMax = Math.max(sMin, Math.min(maxW / pinch.w0, maxH / pinch.h0))

    // Clampe l'ACCUMULATEUR lui-même dans la plage valide (pas seulement `s`) → pas
    // d'accumulation hors-plage qui créerait une dead-zone au relâchement ou un drift.
    const logMin = Math.log(sMin)
    pinch.logScale = Math.min(Math.max(pinch.logScale, logMin), Math.log(sMax))
    // Collé au plancher → on bloquera tout pinch-in supplémentaire dans `onWheel`.
    atFloor = pinch.logScale <= logMin + 1e-6
    const s = Math.exp(pinch.logScale)
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

    // Si un drag a préempté le verrou pendant la queue du geste, on repart d'un état pinch neuf
    // (qui devra re-tenter d'acquérir le verrou ci-dessous).
    if (pinch && heldGesture() !== 'pinch') pinch = null

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
      // Plancher ré-appris à chaque geste (la géométrie de départ change) ; `prevOuter*` amorcés
      // à la taille de départ pour ne pas fausser la détection de plateau à la 1re frame.
      floorScale = 0
      stuckW = 0
      stuckH = 0
      atFloor = false
      prevOuterW = pinch.w0
      prevOuterH = pinch.h0
    }

    // Accumulation en log-space : zoom-in et zoom-out sont symétriques. `delta > 0` = pinch-in
    // (rétrécit). À la dimension minimale, on IGNORE tout pinch-in supplémentaire (sinon on
    // accumulerait une réserve à « défaire » avant que le pinch-out ne reparte) ; un pinch-out
    // (`delta < 0`) passe toujours et réactive le scale.
    const delta = Math.max(-DELTA_CLAMP, Math.min(DELTA_CLAMP, e.deltaY))
    if (!(atFloor && delta > 0)) pinch.logScale -= delta * SCALE_SENSITIVITY

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
