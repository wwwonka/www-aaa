import { appOrchestrator } from '../core/AppOrchestrator';
import type { AssetsManagerApi } from '../core/AssetsManager';

/** Dependencies injected into {@link setupDevKeyboardShortcuts}. */
interface DevKeyboardShortcutDeps {
  assetsManager: AssetsManagerApi;
  onAuthoringKey: () => void;
  /** Cmd/Ctrl+S — exports the current Theatre.js scenarios to disk. No-op if authoring mode is off. */
  onSaveKey: () => void;
}

/** DEV-only keyboard shortcuts — Space/Enter simulate controller input for testing without a real controller; 'T' toggles Theatre.js authoring mode; Cmd/Ctrl+S exports it to disk. */
export function setupDevKeyboardShortcuts({
  assetsManager,
  onAuthoringKey,
  onSaveKey,
}: DevKeyboardShortcutDeps): void {
  window.addEventListener('keydown', (e) => {
    const state = appOrchestrator.getSnapshot().value;

    if (e.key === ' ') {
      appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
      appOrchestrator.send({ type: 'PLAY' });
      void assetsManager.persist();
    }
    if (e.key === 'Enter') {
      if (state === 'IN_GAME') appOrchestrator.send({ type: 'PAUSE' });
      else if (state === 'PAUSED') appOrchestrator.send({ type: 'RESUME' });
    }
    if (e.key.toLowerCase() === 't') {
      onAuthoringKey();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSaveKey();
    }
  });
}
