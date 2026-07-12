/** Suppresses the native right-click context menu across the whole page. */
export function disableContextMenu(): void {
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}
