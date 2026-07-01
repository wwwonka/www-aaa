import { appOrchestrator } from '../core/AppOrchestrator'
import type { AssetsManagerApi } from '../core/AssetsManager'

interface DevKeyboardShortcutDeps {
  assetsManager:  AssetsManagerApi
  onAuthoringKey: () => void
}

/** DEV-only keyboard shortcuts — Space/Enter simulate controller input for testing without a real controller; 'T' toggles Theatre.js authoring mode. */
export function setupDevKeyboardShortcuts({ assetsManager, onAuthoringKey }: DevKeyboardShortcutDeps): void {
  window.addEventListener('keydown', (e) => {
    const state = appOrchestrator.getSnapshot().value

    if (e.key === ' ') {
      appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' })
      appOrchestrator.send({ type: 'PLAY' })
      assetsManager.persist()
    }
    if (e.key === 'Enter') {
      if (state === 'IN_GAME')     appOrchestrator.send({ type: 'PAUSE' })
      else if (state === 'PAUSED') appOrchestrator.send({ type: 'RESUME' })
    }
    if (e.key.toLowerCase() === 't') {
      onAuthoringKey()
    }
  })
}
