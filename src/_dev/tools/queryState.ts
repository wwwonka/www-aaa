import { appOrchestrator }  from '../../core/AppOrchestrator'
import type { AppState } from '../../core/AppOrchestrator'

// ?state=IN_GAME  — jump directly to any app state on load, skipping menus.
// Useful when iterating on a specific screen without re-navigating every reload.
//
// Valid values: TITLE_SCREEN | IN_GAME | PAUSED
const STATE_EVENTS: Partial<Record<AppState, () => void>> = {
  IN_GAME: () => {
    appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' })
    appOrchestrator.send({ type: 'PLAY' })
  },
  PAUSED: () => {
    appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' })
    appOrchestrator.send({ type: 'PLAY' })
    appOrchestrator.send({ type: 'PAUSE' })
  },
}

export function applyQueryStateShortcut(): void {
  const target = new URLSearchParams(location.search).get('state') as AppState | null
  if (!target) return
  const jump = STATE_EVENTS[target]
  if (jump) {
    jump()
  } else {
    console.warn(`[dev] ?state=${target} non reconnu. Valeurs valides: ${Object.keys(STATE_EVENTS).join(', ')}`)
  }
}
