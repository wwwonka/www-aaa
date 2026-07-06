import { RenderManager } from '../../render/RenderManager';
import { devLoadersReady } from '../../render/assets/registerDefaultLoaders';
import { detectAppContext } from '../../app/platform/ContextManager';
import { appOrchestrator } from '../../core/AppOrchestrator';
import { installBrowserGuards } from '../../app/guards/_index';
import { registerServiceWorker } from '../../app/platform/serviceWorkerRegister';
import { DebugOverlay } from '../overlay/DebugOverlay';
import { setupDevTools } from '../setup';
import { createGameSim } from '../../sim/GameSim';
import type { GameSim } from '../../sim/GameSim';
import { attachKeyboardSimControls } from './simControls';

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

  // Comme render.worker.ts : les loaders d'assets s'enregistrent par effet de bord de l'import,
  // et le loader JSON dev doit être prêt avant le premier loadMesh de sceneSetup.
  await devLoadersReady;
  await manager.init(canvas);

  // Sur le main thread, `engine.resize()` (déclenché par les messages resize) recalcule le
  // backing store depuis clientWidth × hardwareScaling — à 1, il écrase notre taille physique
  // par la taille CSS et désaligne Babylon du layout Pixi (qui reste en pixels physiques).
  // Sans objet en worker : l'OffscreenCanvas n'a pas de clientWidth.
  manager._engine.setHardwareScalingLevel(1 / dpr);
  window.postMessage({ type: 'resize', width: canvas.width, height: canvas.height });

  // UI Pixi complète en monolith : screens + events envoyés directement à l'orchestrateur
  // (pas de Comlink). Pas de relais pointer ici : le canvas est un vrai élément DOM, donc
  // l'EventSystem Pixi (setTargetElement dans RenderManager.init) reçoit les événements
  // nativement — relayer en plus via pointerBridge produirait un double dispatch et des
  // Events synthétiques incomplets (crash elementFromPoint).
  await manager.setSendToAsm((event: unknown) => appOrchestrator.send(event as never));

  // Même contournement que pointerBridge côté worker : l'EventSystem Pixi réécrit
  // `rootBoundary.rootTarget` depuis `renderer.lastObjectRendered` à chaque événement, et cette
  // détection ne fonctionne pas avec notre contexte GL partagé Babylon+Pixi — on la réaffirme
  // en phase capture, avant les listeners de l'EventSystem.
  const reassertRootTarget = (): void => {
    if (manager._ui) manager._ui.renderer.events.rootBoundary.rootTarget = manager._ui.stage;
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointerover', 'pointerout']) {
    window.addEventListener(type, reassertRootTarget, { capture: true });
  }

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

  // Étape 3 (validation monolith) : la sim boids+Havok tourne sur le main thread, steppée
  // depuis la boucle de rendu. Le wasm Havok se précharge pendant le Title Screen pour que
  // PLAY soit instantané. En workers, ce câblage vivra dans simulation.worker.ts (étape 4).
  const simPromise = createGameSim();
  let sim: GameSim | null = null;
  let currentState = '';

  // Delta mesuré ici : `engine.getDeltaTime()` reste à 0 car la boucle custom (renderLoop.ts)
  // appelle `scene.render()` sans passer par `engine.runRenderLoop`.
  let lastFrameTs = 0;
  manager._scene?.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const deltaMs = lastFrameTs ? now - lastFrameTs : 16.7;
    lastFrameTs = now;
    if (sim && currentState === 'IN_GAME') {
      sim.update(deltaMs);
    }
  });

  appOrchestrator.subscribe((snapshot) => {
    currentState = String(snapshot.value);
    renderApi.showScreen(snapshot.value as any);
    if (currentState === 'IN_GAME' && !sim) {
      void simPromise.then((created) => {
        sim = created;
        // Handle debug console (dev only) — inspecter/stepper la sim à la main.
        (window as unknown as { __sim: GameSim }).__sim = created;
        manager.attachGameBuffers({
          boidMatrices: created.boidMatrices,
          propMatrices: created.propMatrices,
          targetPosition: created.targetPosition,
        });
        attachKeyboardSimControls((x, z) => created.setMoveInput(x, z));
      });
    }
  });
  appOrchestrator.startUp();
  // Pas de pairing en monolith : on lève la garde `hasController` pour que PLAY soit accessible,
  // et on bascule le prompt du title sur "START GAME".
  appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
  manager.setControllerPaired('MONOLITH');

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const dpr = window.devicePixelRatio ?? 1;
      const size = entry.devicePixelContentBoxSize?.[0];
      const w = size ? size.inlineSize : Math.round(entry.contentRect.width * dpr);
      const h = size ? size.blockSize : Math.round(entry.contentRect.height * dpr);
      // Même canal que le mode workers : RenderManager écoute les messages `resize` sur `self`
      // (qui est `window` ici) et applique canvas+engine+UI dans le même tick.
      window.postMessage({ type: 'resize', width: w, height: h });
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
  // Handle debug console (dev only) — inspecter le RenderManager à la main.
  (window as unknown as { __rm: unknown }).__rm = manager;
}
