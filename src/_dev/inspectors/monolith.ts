import { RenderManager } from '../../render/RenderManager';
import { detectAppContext } from '../../app/platform/ContextManager';
import { appOrchestrator } from '../../core/AppOrchestrator';
import { installBrowserGuards } from '../../app/guards/_index';
import { registerServiceWorker } from '../../app/platform/serviceWorkerRegister';
import { DebugOverlay } from '../overlay/DebugOverlay';
import { setupDevTools } from '../setup';

// TODO: Les méthodes debug (scene, resize, setVisibility, attachDebugOverlay, etc.)
// seront rajoutées à RenderManager quand on implémente le debug tooling complet.
// En attendant, on cast en any pour garder le fichier compilable.

/** DEV-only "monolith" bootstrap — single-window entry point wiring RenderManager, the app orchestrator, resize/visibility handling and dev tools directly, without the worker split used in prod. */
export async function startMonolithMode(): Promise<void> {
  const ctx = detectAppContext();
  installBrowserGuards();
  void registerServiceWorker(ctx.runtime);

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const dpr = window.devicePixelRatio ?? 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);

  const manager = new RenderManager() as any;

  await manager.init(canvas);

  // @babylonjs/inspector doit être installé (pnpm add -D @babylonjs/inspector) avant d'activer ces lignes
  // await import('@babylonjs/inspector')
  // manager._scene.debugLayer.show({ embedMode: true })

  const overlay = new DebugOverlay();

  // Attach PixiJS overlay container directly to the Pixi stage
  if (manager._ui?.stage) {
    manager._ui.stage.addChild(overlay.container);
  }

  // Update FPS/frame time stats on every frame
  manager._scene?.onBeforeRenderObservable.add(() => {
    if (manager._engine && overlay.container.visible) {
      overlay.update({
        fps: manager._engine.getFps(),
        frameMs: manager._engine.getDeltaTime(),
      });
    }
  });

  const renderApi = {
    showScreen: (state: any) => manager.showScreen(state),
    setFps: (fps: number) => manager.setFps(fps),
    setWireframe: (v: boolean) => {
      if (manager._scene) manager._scene.forceWireframe = v;
    },
    showBoundingBoxes: (v: boolean) => {
      if (manager._scene) manager._scene.forceShowBoundingBoxes = v;
    },
    dumpSceneStats: () => {
      if (manager._scene) {
        console.log('[Dev Monolith] Scene Stats:', {
          meshes: manager._scene.meshes.length,
          activeMeshes: manager._scene.getActiveMeshes().length,
          materials: manager._scene.materials.length,
          textures: manager._scene.textures.length,
        });
      }
    },
    toggleDebugOverlay: () => overlay.toggle(),
  };

  appOrchestrator.subscribe((snapshot) => renderApi.showScreen(snapshot.value as any));
  appOrchestrator.startUp();

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const dpr = window.devicePixelRatio ?? 1;
      const size = entry.devicePixelContentBoxSize?.[0];
      const w = size ? size.inlineSize : Math.round(entry.contentRect.width * dpr);
      const h = size ? size.blockSize : Math.round(entry.contentRect.height * dpr);
      canvas.width = w;
      canvas.height = h;
      manager.resize(w, h);
    }
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas, { box: 'content-box' });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      manager._stopLoop?.();
    } else {
      manager._restartLoop?.();
    }
  });

  setupDevTools(ctx, renderApi);
}
