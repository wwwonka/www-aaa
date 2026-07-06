/**
 * Bascule le plein écran navigateur. Partagé entre le raccourci touche `F` et le double-clic
 * des PWA desktop (voir `platform/pwa/AppWindowFullscreen.ts`) — à appeler depuis un geste
 * utilisateur (`requestFullscreen` exige une activation transitoire).
 */
export function toggleFullscreen(): void {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

/**
 * Toggles browser fullscreen on the `F` key (without Ctrl/Cmd/Alt, to avoid stealing
 * browser shortcuts like Ctrl+F find-in-page).
 */
export function setupFullscreenHandler(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    toggleFullscreen()
  })
}
