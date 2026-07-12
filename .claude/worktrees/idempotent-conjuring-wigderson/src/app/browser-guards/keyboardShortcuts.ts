// Blocks browser keyboard shortcuts that would interfere with the game
// (select-all, save, print, find, etc.) without swallowing every keystroke.
// '+'/'-'/'=' block Ctrl/Cmd +/- page zoom — '=' is the physical key '+'
// sits on without Shift on most layouts, and is what e.key actually reports
// for Ctrl/Cmd+Plus on many keyboards/browsers, so both need blocking.
const BLOCKED_KEYS = new Set(['a', 's', 'p', 'n', 'f', 'g', 'd', '+', '-', '='])

export function disableKeyboardShortcuts(): void {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && BLOCKED_KEYS.has(e.key.toLowerCase())) {
      e.preventDefault()
    }
  })
}
