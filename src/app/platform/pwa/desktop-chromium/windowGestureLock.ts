// Verrou d'exclusion mutuelle entre les gestes qui pilotent la position/taille de la fenêtre
// OS (`window.moveTo`/`resizeTo`). Le drag clic-maintenu (`AppWindowDrag`) et le pinch
// trackpad (`AppWindowPinch`) écrivent tous deux la géométrie de la fenêtre : s'ils
// tournaient en même temps, ils se battraient pour la position et la fenêtre jitterait.
//
// Un pinch trackpad (deux doigts) n'émet pas de `pointerdown`, donc le chevauchement est rare
// en pratique — mais le verrou est un simple check de booléen (coût runtime nul) et rétablit
// exactement le pattern éprouvé de l'ancienne PWA, plutôt que de parier sur l'absence de
// chevauchement. Chromium PWA desktop uniquement (seul contexte où `moveTo`/`resizeTo`
// fonctionnent), donc gardé dans le dossier `desktop-chromium/`.

type GestureName = 'drag' | 'pinch'

let held: GestureName | null = null

/**
 * Tente de prendre le verrou ; renvoie `false` s'il est déjà tenu par un autre geste.
 *
 * Exception : le `'drag'` PRÉEMPTE le `'pinch'`. Un `pointerdown` est un geste explicite et le
 * pinch trackpad n'émet jamais de `pointerdown`, donc si un drag démarre pendant la « queue » du
 * pinch (le verrou reste tenu ~180 ms après le dernier wheel), il vole le verrou plutôt que
 * d'échouer — sinon un drag juste après un pinch ne partirait pas. Le pinch détecte la
 * préemption via `heldGesture()` et s'abandonne (voir `AppWindowPinch`).
 */
export function acquireGesture(name: GestureName): boolean {
  if (held === null || held === name) { held = name; return true }
  if (name === 'drag' && held === 'pinch') { held = 'drag'; return true }
  return false
}

/** Relâche le verrou si (et seulement si) c'est bien ce geste qui le tenait. */
export function releaseGesture(name: GestureName): void {
  if (held === name) held = null
}

/** Geste qui tient actuellement le verrou (ou `null`). Sert au pinch à détecter une préemption. */
export function heldGesture(): GestureName | null {
  return held
}
