import * as Comlink from 'comlink';
import type { RenderWorkerApi } from '../render/render.worker';
import { mountEventHandlers } from './events/_index';
import { installBrowserGuards } from './guards/_index';
import { detectAppContext } from './platform/ContextManager';
import { registerServiceWorker } from './platform/serviceWorkerRegister';
import { setupPwaExperience } from './platform/pwa/_index';
import { appOrchestrator } from '../core/AppOrchestrator';
import type { AppState, AppEvent } from '../core/AppOrchestrator';
import { createAssetsManager } from '../core/AssetsManager';
import type { AssetsManagerApi } from '../core/AssetsManager';
import { allocateSystems } from '../core/SystemAllocator';
import type { SystemHostApi } from '../core/SystemHost.worker';
import type { QueryFlags } from './platform/queryFlags';

/**
 * Boots the app shell: detects the runtime context, installs browser guards, spins up the
 * assets manager (worker or inline, per {@link allocateSystems}), transfers the canvas to the
 * render worker, and wires the orchestrator's screen transitions to the renderer.
 */
export class AppHost {
  /**
   * Runs the full startup sequence and returns the live handles the caller needs
   * once the canvas has been handed off to the render worker.
   *
   * @param flags - Flags de boot parsés depuis l'URL (rôle forcé session-only, etc.).
   */
  async start(
    flags?: QueryFlags,
  ): Promise<{ assetsManager: AssetsManagerApi; renderApi: RenderWorkerApi }> {
    const ctx = detectAppContext(flags?.forcedRole);
    installBrowserGuards();
    void registerServiceWorker(ctx.runtime);

    // SystemAllocator décide si les systèmes "agiles" (AssetsManager aujourd'hui) tournent dans
    // un SystemHost worker dédié ou inline sur le main thread, selon hardwareConcurrency et la
    // règle N-1 — voir docs/system-allocator.md. Sur les appareils avec assez de cœurs, ça évite
    // au warm-up (transactions IDB + fetch par asset) de se battre pour les ticks JS du main
    // thread pendant que Babylon/PixiJS bootstrapent, ni pour ceux du render worker pendant
    // qu'il compile ses shaders ; sur les appareils à peu de cœurs, ça évite un 3ᵉ thread inutile.
    const allocation = allocateSystems(navigator.hardwareConcurrency, ['assetsManager'] as const);
    const assetsManager: AssetsManagerApi =
      allocation.mode === 'worker'
        ? ((await Comlink.wrap<SystemHostApi>(
            // name: visible dans l'onglet Threads/Workers de Safari Web Inspector et Chrome
            // DevTools — sans ça, le worker n'apparaît que sous l'URL du fichier .worker.ts.
            new Worker(new URL('../core/SystemHost.worker.ts', import.meta.url), {
              type: 'module',
              name: 'SystemHostWorker',
            }),
          ).get('assetsManager')) as unknown as AssetsManagerApi)
        : createAssetsManager();

    // TODO: séquencer namespace 'app' (menu) puis 'game' (simulation) une fois le
    // chargement granulaire piloté par AppOrchestrator — pour l'instant tout d'un coup.
    void assetsManager.warmUp(
      undefined,
      Comlink.proxy((event) =>
        appOrchestrator.send({ ...event, type: `ASSET_${event.type.toUpperCase()}` } as AppEvent),
      ),
    );

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;

    // Taille physique initiale avant le transfert — le worker n'a plus accès à window après
    const dpr = window.devicePixelRatio ?? 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);

    const offscreen = canvas.transferControlToOffscreen();

    const renderWorker = new Worker(new URL('../render/render.worker.ts', import.meta.url), {
      type: 'module',
      name: 'RenderWorker',
    });
    const renderApi = Comlink.wrap<RenderWorkerApi>(renderWorker);

    await renderApi.init(Comlink.transfer(offscreen, [offscreen]));

    // Avant setSendToAsm (qui construit les screens) : le worker ne peut ni détecter le rôle ni
    // lire l'URL de la page — son `location` pointe sur le script du worker.
    await renderApi.setShellContext({
      role: ctx.role === 'controller' ? 'controller' : 'receiver',
      pageUrl: `${window.location.origin}${window.location.pathname}`,
    });

    await renderApi.setSendToAsm(Comlink.proxy((event: AppEvent) => appOrchestrator.send(event)));

    // Miroir du survol UI poussé par le render worker — lu synchroniquement par le handler
    // dblclick→plein écran des PWA desktop (voir platform/pwa/AppWindowFullscreen.ts).
    let overGameUI = false;
    await renderApi.setOverGameUI(
      Comlink.proxy((over: boolean) => {
        overGameUI = over;
      }),
    );

    // xstate émet un nouveau snapshot à chaque `.send()`, y compris les events ASSET_PROGRESS du
    // warmUp() parallélisé (un par asset) — sans déduplication, showScreen() (et donc
    // playAnimation côté Worker) se déclencherait une fois par asset au lieu d'une fois par
    // vrai changement d'écran.
    let lastScreenState: string | undefined;
    let lastHasController = false;
    appOrchestrator.subscribe((snapshot) => {
      // Miroir searching ⇄ paired vers l'overlay de pairing — le nom réel du peer arrivera avec
      // l'identité Trystero (Étape 2), placeholder générique en attendant.
      const { hasController } = snapshot.context;
      if (hasController !== lastHasController) {
        lastHasController = hasController;
        void renderApi.setControllerPaired(hasController ? 'controller' : null);
      }

      if (snapshot.value === lastScreenState) return;
      lastScreenState = snapshot.value as string;
      void renderApi.showScreen(snapshot.value as AppState);
    });
    appOrchestrator.startUp();

    // Un device controller boote directement sur l'interface de pairing plein écran.
    if (ctx.role === 'controller') appOrchestrator.send({ type: 'OPEN_PAIRING' });

    mountEventHandlers({ canvas, renderWorker });
    setupPwaExperience(ctx.runtime, () => overGameUI);

    return { assetsManager, renderApi };
  }
}
