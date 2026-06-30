import { createGroupLogger, createLogger } from './logger'
import type { AppContext }                 from '../app/platform/ContextManager'
import { appOrchestrator }                 from '../core/AppOrchestrator'
import { applyQueryStateShortcut }         from './tools/queryState'

type DevRenderApi = {
  setWireframe?:       (v: boolean) => void
  showBoundingBoxes?:  (v: boolean) => void
  dumpSceneStats?:     () => void
  toggleDebugOverlay?: () => void
}

// Sets up DEV-only logging and keyboard shortcuts.
// Imported exclusively from the DEV block at the end of AppHost.start().
export function setupDevTools(ctx: AppContext, renderApi: DevRenderApi): void {
  // Styled context log on startup
  const log    = createGroupLogger('AppHost', '#2c3e50')
  const logAsm = createLogger('ASM', '#8e44ad')

  log.group(`${ctx.platform} | ${ctx.role}`)
  log.row('platform', ctx.platform)
  log.row('role',     ctx.role)
  log.groupEnd()

  appOrchestrator.subscribe(snapshot => logAsm(`→ ${String(snapshot.value)}`))

  applyQueryStateShortcut()

  // Debug keyboard shortcuts — all Ctrl+key to avoid collisions with game input
  let wireframe      = false
  let boundingBoxes  = false

  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return
    switch (e.key.toLowerCase()) {
      case 'd': renderApi.toggleDebugOverlay?.(); break
      case 'w': renderApi.setWireframe?.(wireframe = !wireframe); break
      case 'b': renderApi.showBoundingBoxes?.(boundingBoxes = !boundingBoxes); break
      case 's': renderApi.dumpSceneStats?.(); break
    }
  })
}
