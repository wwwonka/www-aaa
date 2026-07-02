/**
 * Toggles browser fullscreen on the `F` key (without Ctrl/Cmd/Alt, to avoid stealing
 * browser shortcuts like Ctrl+F find-in-page).
 */
export function setupFullscreenHandler(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  })
}
