import * as Comlink from 'comlink';
import type { RenderWorkerApi } from '../render/render.worker';
import { mountEventHandlers } from './events/_index';
import { installBrowserGuards } from './guards/_index';
import type { AppContext } from './platform/ContextManager';
import { registerServiceWorker } from './platform/serviceWorkerRegister';
import { setupPwaExperience } from './platform/pwa/_index';
import { appOrchestrator } from '../core/AppOrchestrator';
import type { AppEvent } from '../core/AppOrchestrator';
import { createAssetsManager } from '../core/assets/AssetsManager';
import type { AssetsManagerApi } from '../core/assets/AssetsManager';
import type { SystemHostApi } from '../core/SystemHost.worker';
import type { QueryFlags } from './platform/queryFlags';
import { generateDeviceName, persistentRoomCode } from '../input/signaling/identity';
import { createControlSAB } from '../core/sab-manager';
import type { InputHub } from '../input/InputHub';
import { setupPairing } from './boot/pairing';
import type { SimControl } from './boot/simControl';
import { benchmarkDevice } from './boot/deviceBenchmark';
import { startRenderThread } from './boot/renderThread';
import { createDeferredSim } from './boot/simControl';
import { setupScreens } from './boot/screens';
import { setupSoloMode } from './boot/soloMode';
import { runWhenIdle } from './platform/idle';

/**
 * Chef d'orchestre du boot receiver/solo : enchaîne une séquence d'étapes nommées et déléguées —
 * benchmark + topologie (`boot/deviceBenchmark`), thread de rendu (`boot/renderThread`), simulation
 * différée (`boot/simControl`), câblage de contrôle (`setup/pairing`), transitions d'écran
 * (`setup/screens`) et déblocage solo/manette (`setup/soloMode`). Ne contient plus de logique propre,
 * seulement l'ordre. Réservé au receiver/solo (le controller pur boote via `ControllerHost`).
 */
export class AppHost {
  /**
   * Runs the full startup sequence and returns the live handles the caller needs
   * once the canvas has been handed off to the render worker.
   *
   * @param flags - Flags de boot parsés depuis l'URL (rôle forcé session-only, etc.).
   * @param ctx - Contexte détecté par `main.ts` (routing par rôle) — jamais controller ici,
   * ce chemin est réservé au receiver/solo (le controller pur boote via `ControllerHost`).
   */
  async start(
    flags: QueryFlags | undefined,
    ctx: AppContext,
  ): Promise<{
    assetsManager: AssetsManagerApi;
    renderApi: RenderWorkerApi;
    inputHub: InputHub;
    simControl: SimControl;
  }> {
    // Mobile en URL de base : receiver qui est aussi sa propre manette (joysticks tactiles
    // locaux). Débloque PLAY sans pairing + autorité locale (§B.5). Faux sur desktop (manette
    // requise).
    const selfControlled = ctx.platform === 'mobile' && ctx.role === 'receiver';
    installBrowserGuards();
    void registerServiceWorker(ctx.runtime);

    // Étape 1 (CLAUDE.md §3) : benchmark de perf + décision de topologie de threads, AVANT tout
    // spawn (voir boot/deviceBenchmark). Le SystemAllocator y place aussi les systèmes agiles.
    const { tier, allocation } = benchmarkDevice(flags);
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

    // Étape 2 : démarre le thread de rendu (canvas → offscreen, spawn worker, init, miroir survol UI).
    const { renderApi, renderWorker, canvas, isOverGameUI } = await startRenderThread(tier);

    // Identité de session : le receiver résout son code de room dès le boot (le QR est construit une
    // seule fois avec l'overlay shell) mais ne joint la room qu'à OPEN_PAIRING (voir pairingHost).
    // Code PERSISTANT par onglet (sessionStorage) : un reload receiver garde le même QR valide.
    const shellRole = 'receiver' as const;
    const roomCode = persistentRoomCode();
    const deviceName = generateDeviceName();
    // DX : tester le flow deux-onglets exige le code sans scanner le QR (phone only).
    if (import.meta.env.DEV) console.log(`[AppHost] room ${roomCode} — controller: ?r=${roomCode}`);

    // URL de la page (origin+pathname) — affichée par l'overlay de pairing shell et encodée
    // dans son QR (`?r=CODE`).
    const pageUrl = `${window.location.origin}${window.location.pathname}`;

    // Avant setSendToAsm (qui construit les screens) : le worker ne peut pas détecter le rôle
    // (UA/localStorage vivent côté main). L'identité de pairing (URL, code, nom) va au shell DOM.
    await renderApi.setShellContext({ role: shellRole, selfControlled });

    // SAB de contrôle (CLAUDE.md §7) : le main écrit (joysticks — RTC du peer pairé ou locaux
    // quand ce device est l'autorité —, clavier dev), la sim draine à chaque step. Les DEUX
    // rôles en ont un : le sim worker vit là où l'autorité peut vivre (§B.5).
    const controlSab = createControlSAB();
    const controlView = new Int32Array(controlSab);

    // Simulation (boids + Havok) : façade de contrôle à init différée title-first (voir
    // boot/simControl). `initSim` sera déclenché en idle plus bas, après `startUp()`.
    const { sim: simControl, initReal: initSim } = createDeferredSim({ tier, controlSab, renderApi });

    // Tout le câblage de contrôle du device : shell DOM, hub d'input (tactile + manette), pairing
    // réseau, FSM d'autorité (handoff), scanner « use as controller », interception setSendToAsm.
    const { shellHost, handoff: boundHandoff, isActingAsController, inputHub } = await setupPairing({
      renderApi,
      controlView,
      sim: simControl,
      selfControlled,
      shellRole,
      roomCode,
      deviceName,
      pageUrl,
    });

    // Transitions d'écran + start/stop de la sim, pilotés par l'AppState (voir setup/screens).
    setupScreens({ renderApi, sim: simControl, handoff: boundHandoff, isActingAsController, controlView });
    appOrchestrator.startUp();

    // Init réelle de la sim en idle (title-first) : le premier snapshot vient de partir vers
    // le render worker — le spawn sim/wasm ne lui dispute plus le boot.
    runWhenIdle(initSim);

    // Déblocage de PLAY sans controller distant (solo tactile OU manette locale) + gate d'orientation.
    setupSoloMode({ selfControlled, renderApi, shellHost, controlView, deviceName });

    mountEventHandlers({ canvas, renderWorker });
    setupPwaExperience(ctx.runtime, isOverGameUI);

    // `inputHub` + `simControl` remontent à `main.ts` pour que `initDev` (DEV only) y branche le
    // controller simulé + le clavier dev (voir _dev/app/devController). Le `?dev` ne vit plus ici.
    return { assetsManager, renderApi, inputHub, simControl };
  }
}
