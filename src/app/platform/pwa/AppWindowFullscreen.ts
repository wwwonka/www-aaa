import { toggleFullscreen } from '../../events/fullscreenHandler'

// Double-clic → bascule le plein écran, sur toutes les PWA desktop (chromium/firefox/safari).
// `requestFullscreen()` exige d'être appelé synchroniquement dans le geste utilisateur, donc
// la décision se prend ici sur le main thread — pas d'aller-retour worker qui casserait
// l'activation transitoire.
//
// `isOverGameUI()` reflète (miroir poussé par le render worker) si le curseur survole un
// contrôle Pixi interactif. Comme les boutons sont dessinés DANS le canvas et ne sont pas des
// éléments DOM, c'est le seul moyen pour ce handler DOM de savoir s'il doit s'abstenir : un
// double-clic sur un bouton laisse le bouton gérer son propre double-tap et ne déclenche pas
// le plein écran ; un double-clic sur toute autre zone bascule.
//
// Retourne un `dispose()` pour un tear-down propre, en symétrie avec les autres handlers.
export function setupDblclickFullscreen(isOverGameUI: () => boolean): () => void {
  const onDblClick = () => {
    if (isOverGameUI()) return
    toggleFullscreen()
  }

  document.addEventListener('dblclick', onDblClick)

  return function dispose() {
    document.removeEventListener('dblclick', onDblClick)
  }
}
