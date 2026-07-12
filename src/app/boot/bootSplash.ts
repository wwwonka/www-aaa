/**
 * Retire le splash statique inclus dans `index.html` (voir `boot-splash.html`) — idempotent.
 * Chaque host l'appelle à son premier écran réellement monté : AppHost à la résolution du
 * premier `showScreen`, ControllerHost dès l'overlay de pairing shell affiché.
 */
export function removeBootSplash(): void {
  document.getElementById('boot-splash')?.remove();
}
