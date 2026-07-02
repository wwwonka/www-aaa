import { appOrchestrator } from '../core/AppOrchestrator'
import type { AssetsManagerApi } from '../core/AssetsManager'
import type { RenderWorkerApi } from '../render/render.worker'
import { setupDevKeyboardShortcuts } from './DevKeyboardShortcutListener'

let authoringEnabled = false
// `setupTheatreBridge` calls `sheet.object(id, config)` per scenario object — Theatre.js throws if
// that's called twice with a different (even if numerically identical) config object, since it
// can't tell that wasn't an intentional reconfiguration. So the bridge is wired up exactly once,
// ever — re-enabling authoring after a hide just restores the Studio UI, it never re-registers.
let bridgeInitialized = false

/**
 * Toggles Theatre.js authoring mode on 'T'. `@theatre/studio` is only ever imported here, inside
 * this function body — never at module load — so a DEV refresh never pays its cost unless
 * explicitly requested. Off by default: the game boots in "Play" mode, same as prod.
 *
 * @param renderApi - Comlink proxy into the render worker; used to pause/resume baked playback and to receive live-edited values.
 */
export async function toggleAuthoringMode(renderApi: RenderWorkerApi): Promise<void> {
  if (!authoringEnabled) {
    authoringEnabled = true
    await renderApi.pauseAnimationPlayback()
    if (!bridgeInitialized) {
      bridgeInitialized = true
      const { setupTheatreBridge } = await import('./@theatre/bridge')
      setupTheatreBridge(appOrchestrator, (id, value) => renderApi.applyExternalValue(id, value))
    } else {
      const { restoreStudio } = await import('./@theatre/studio')
      restoreStudio()
    }
  } else {
    authoringEnabled = false
    const { hideStudio } = await import('./@theatre/studio')
    hideStudio()
    await renderApi.resumeAnimationPlayback()
  }
}

/** DEV-only entry point — call once from `main.ts` behind `import.meta.env.DEV`. Wires the 'T'/Cmd+S shortcuts; never imports `@theatre/studio` itself (see {@link toggleAuthoringMode}). */
export function initDev(deps: { assetsManager: AssetsManagerApi; renderApi: RenderWorkerApi }): void {
  setupDevKeyboardShortcuts({
    assetsManager:  deps.assetsManager,
    onAuthoringKey: () => toggleAuthoringMode(deps.renderApi),
    onSaveKey: () => {
      // Rien à exporter si Studio n'est même pas ouvert.
      if (!authoringEnabled) return
      import('./@theatre/export').then(({ exportScenarios }) => exportScenarios())
    },
  })
}
