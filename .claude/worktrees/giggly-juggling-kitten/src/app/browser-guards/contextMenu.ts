export function disableContextMenu(): void {
  window.addEventListener('contextmenu', (e) => e.preventDefault())
}
