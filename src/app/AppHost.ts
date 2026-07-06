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
import type { SimulationWorkerApi } from '../sim/simulation.worker';
import { setupPairingHost } from './pairingHost';
import { generateDeviceName, generateRoomCode } from '../input/signaling/identity';

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
    // Un `?r=CODE` seul (URL scannée depuis le QR d'un receiver) implique le rôle controller ;
    // les flags explicites `?controller`/`?receiver` gardent la priorité.
    const impliedRole = flags?.roomCode != null ? ('controller' as const) : null;
    const ctx = detectAppContext(flags?.forcedRole ?? impliedRole);
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

    // Identité de session (jamais persistée) : le receiver génère son code de room dès le boot
    // (le QR est construit une seule fois avec les screens) mais ne joint la room MQTT qu'à
    // OPEN_PAIRING (voir pairingHost) ; le controller reprend le code scanné dans `?r=`.
    const shellRole = ctx.role === 'controller' ? ('controller' as const) : ('receiver' as const);
    const roomCode = shellRole === 'receiver' ? generateRoomCode() : (flags?.roomCode ?? null);
    const deviceName = generateDeviceName();

    // Avant setSendToAsm (qui construit les screens) : le worker ne peut ni détecter le rôle ni
    // lire l'URL de la page — son `location` pointe sur le script du worker.
    await renderApi.setShellContext({
      role: shellRole,
      pageUrl: `${window.location.origin}${window.location.pathname}`,
      roomCode,
      deviceName,
    });

    const pairing = setupPairingHost({ role: shellRole, roomCode, deviceName, renderApi });

    await renderApi.setSendToAsm(
      Comlink.proxy((event: AppEvent) => {
        // Un PLAY local (START GAME / START) doit aussi lancer la partie sur le peer pairé —
        // l'action réseau part d'ici, le `onStart` distant n'émet que le PLAY local (pas d'écho).
        if (event.type === 'PLAY') pairing.notifyLocalPlay();
        appOrchestrator.send(event);
      }),
    );

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
    // Le miroir searching ⇄ paired vers l'UI (setControllerPaired, avec le vrai nom du peer)
    // appartient désormais à pairingHost — ici on ne relaye que les changements d'écran.
    // Simulation worker (boids + Havok) — receiver uniquement : le device actif est l'unique
    // autorité du game state (CLAUDE.md §4) ; le controller n'héberge pas de sim avant le
    // handoff (étape 6). Spawn au boot pour précharger le wasm Havok pendant le Title Screen,
    // buffers SAB relayés au render worker (mémoire partagée, zéro copie), start/stop sur IN_GAME.
    let simApi: Comlink.Remote<SimulationWorkerApi> | null = null;
    let simReady: Promise<void> | null = null;
    if (shellRole === 'receiver') {
      simApi = Comlink.wrap<SimulationWorkerApi>(
        new Worker(new URL('../sim/simulation.worker.ts', import.meta.url), {
          type: 'module',
          name: 'SimulationWorker',
        }),
      );
      simReady = simApi.init().then(async (buffers) => {
        await renderApi.attachGameBuffers(buffers);
      });
      // Erreur froide (wasm indisponible…) : loggée, le title reste fonctionnel — PLAY mènera
      // à une arène vide plutôt qu'à un boot cassé.
      simReady.catch((err: unknown) => console.error('[AppHost] sim worker init failed:', err));
    }

    let lastScreenState: string | undefined;
    appOrchestrator.subscribe((snapshot) => {
      if (snapshot.value === lastScreenState) return;
      const wasInGame = lastScreenState === 'IN_GAME';
      lastScreenState = snapshot.value as string;
      void renderApi.showScreen(snapshot.value as AppState);
      if (simApi !== null) {
        if (snapshot.value === 'IN_GAME') {
          const boundSimApi = simApi;
          void simReady?.then(() => boundSimApi.start());
        } else if (wasInGame) {
          void simApi.stop();
        }
      }
    });
    appOrchestrator.startUp();

    // `?dev` (build DEV seulement — en prod ce bloc est tree-shaké et la garde `hasController`
    // reste le seul chemin vers IN_GAME) : controller simulé pour débloquer PLAY + pilotage
    // clavier de la sphère de contrôle, comme en monolith.
    if (import.meta.env.DEV && flags?.dev && shellRole === 'receiver' && simApi !== null) {
      const boundSimApi = simApi;
      appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
      void renderApi.setControllerPaired('DEV');
      const { attachKeyboardSimControls } = await import('../_dev/inspectors/simControls');
      attachKeyboardSimControls((x, z) => void boundSimApi.setMoveInput(x, z));
    }

    // Un device controller boote directement sur l'interface de pairing plein écran.
    if (ctx.role === 'controller') appOrchestrator.send({ type: 'OPEN_PAIRING' });

    mountEventHandlers({ canvas, renderWorker });
    setupPwaExperience(ctx.runtime, () => overGameUI);

    return { assetsManager, renderApi };
  }
}
