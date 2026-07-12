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
import type { PairingHost } from './pairingHost';
import { ShellHost } from './shell/ShellHost';
import { startQrScanner, type QrScannerHandle } from '../input/signaling/qrScanner';
import { createHandoffCoordinator } from './HandoffCoordinator';
import type { HandoffCoordinator } from './HandoffCoordinator';
import { generateDeviceName, generateRoomCode } from '../input/signaling/identity';
import { createControlSAB } from '../core/sab-manager';
import { writeAxes } from '../input/controlChannel';
import { benchmarkCompute, resolveTier } from './platform/workerStrategy';

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
    // Mobile en URL de base : receiver qui est aussi sa propre manette (joysticks tactiles locaux).
    // Débloque PLAY sans pairing + autorité locale (§B.5). Faux dès qu'un rôle est forcé controller
    // (`?controller` / `?r=` d'un QR scanné) et sur desktop (manette requise).
    const selfControlled = ctx.platform === 'mobile' && ctx.role === 'receiver';
    installBrowserGuards();
    void registerServiceWorker(ctx.runtime);

    // Tier de performance (CLAUDE.md §3) : micro-benchmark boot + hardwareConcurrency en
    // secours, `?forceTier` (DEV) en override — AVANT tout spawn, il décide de la topologie
    // (tier low = worker unifié Render+Sim + systèmes agiles inline).
    const forcedTier = import.meta.env.DEV ? (flags?.forceTier ?? null) : null;
    const opsPerMs = benchmarkCompute();
    const tier = resolveTier(opsPerMs, navigator.hardwareConcurrency, forcedTier);
    console.log(
      `[AppHost] tier=${tier} (bench ${Math.round(opsPerMs)} ops/ms, ` +
        `${navigator.hardwareConcurrency} cœurs${forcedTier ? ', forcé' : ''})`,
    );

    // SystemAllocator décide si les systèmes "agiles" (AssetsManager aujourd'hui) tournent dans
    // un SystemHost worker dédié ou inline sur le main thread, selon hardwareConcurrency et la
    // règle N-1 — voir docs/architecture/system-allocator.md. Sur les appareils avec assez de cœurs, ça évite
    // au warm-up (transactions IDB + fetch par asset) de se battre pour les ticks JS du main
    // thread pendant que Babylon/PixiJS bootstrapent, ni pour ceux du render worker pendant
    // qu'il compile ses shaders ; sur les appareils à peu de cœurs, ça évite un 3ᵉ thread inutile.
    // Un tier low mesuré force l'inline même si le compte de cœurs promettait mieux.
    const allocation =
      tier === 'low'
        ? { mode: 'inline' as const, systems: ['assetsManager' as const] }
        : allocateSystems(navigator.hardwareConcurrency, ['assetsManager'] as const);
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
      // Le nom reflète la topologie réelle dans DevTools/Web Inspector : en tier low ce
      // worker héberge aussi la simulation (fusion, docs/architecture/worker-adaptive-strategy.md).
      name: tier === 'low' ? 'Render+SimWorker' : 'RenderWorker',
    });
    const renderApi = Comlink.wrap<RenderWorkerApi>(renderWorker);

    await renderApi.init(Comlink.transfer(offscreen, [offscreen]));

    // Identité de session (jamais persistée) : le receiver génère son code de room dès le boot
    // (le QR est construit une seule fois avec les screens) mais ne joint la room MQTT qu'à
    // OPEN_PAIRING (voir pairingHost) ; le controller reprend le code scanné dans `?r=`.
    const shellRole = ctx.role === 'controller' ? ('controller' as const) : ('receiver' as const);
    const roomCode = shellRole === 'receiver' ? generateRoomCode() : (flags?.roomCode ?? null);
    const deviceName = generateDeviceName();
    // DX : tester le flow deux-onglets exige le code sans scanner le QR (phone only).
    if (import.meta.env.DEV && shellRole === 'receiver')
      console.log(`[AppHost] room ${roomCode} — controller: ?r=${roomCode}`);

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

    // FSM d'autorité (§B.1) — créée après simControl ; les callbacks du pairing la referment
    // en `let` (le canal peut recevoir avant... non : join → paired → handoff, jamais avant).
    let handoff: HandoffCoordinator | null = null;

    // « USE DEVICE AS CONTROLLER » : un mobile solo (selfControlled) bascule en controller après
    // avoir scanné le QR d'un autre écran. Ce flag DÉSARME l'autorité locale — l'input part en RTC
    // vers le receiver distant, et la sim locale ne steppe pas (le receiver est l'autorité).
    let actingAsController = false;

    // Shell applicatif en DOM/CSS (main thread) : toasts, gate d'orientation, joysticks + START (le
    // pairing suivra). Le tactile n'existe que sur les devices à joysticks. Dépendance circulaire
    // (shell → `pairing.sendInput` ; pairing → `shell.showToast`) résolue par un holder : les
    // callbacks du shell lisent `pairing` bien après son affectation.
    const shellHost = new ShellHost({
      usesTouchInput: selfControlled || ctx.role === 'controller',
      onInput: (x, z) => pairing.sendInput(x, z),
      onStart: () => {
        // START shell (controller) : lance la partie ET propage au peer pairé (sync, comme le PLAY
        // intercepté dans setSendToAsm) — le receiver enchaîne sur IN_GAME.
        pairing.notifyLocalPlay();
        appOrchestrator.send({ type: 'PLAY' });
      },
      pairing: { role: shellRole, pageUrl, roomCode, deviceName },
    });

    const pairing: PairingHost = setupPairingHost({
      showToast: (message) => shellHost.showToast(message),
      role: shellRole,
      roomCode,
      deviceName,
      onPhase: (status): void => {
        shellHost.setPairingStatus(status);
        // Miroir vers le prompt du Title Pixi (« CONNECT A CONTROLLER » ⇄ « START GAME ») —
        // même comportement que l'ancien setPairingPhase côté worker.
        if (status.phase === 'paired') void renderApi.setControllerPaired(status.peerName);
        else if (status.phase === 'searching') void renderApi.setControllerPaired(null);
      },
      // Axes → SAB local (policy latest-wins, pipeline §7 de bout en bout).
      applyAxes: (x, z): void => writeAxes(controlView, x, z),
      // Solo mobile : ce device EST l'autorité en permanence → les joysticks tactiles écrivent le
      // SAB local (pas de réseau). Sauf s'il a basculé en controller (`actingAsController`) : alors
      // l'input part en RTC. Sinon, l'autorité suit la FSM de handoff (§B.5).
      isLocalAuthority: () => !actingAsController && (selfControlled || (handoff?.isActive() ?? false)),
      onHandoffRequest: () => handoff?.onRemoteRequest(),
      onHandoffState: (buf) => handoff?.onRemoteState(buf),
      onHandoffAck: () => handoff?.onRemoteAck(),
      onPairedPeerLost: () => handoff?.onPeerLost(),
    });

    // Scanner QR in-app (« USE DEVICE AS CONTROLLER ») — overlay DOM caméra (main thread). Au scan
    // d'un QR de receiver, on isole le code de room et on rejoint à chaud en controller. Le receiver
    // (en pairing) découvrira ce controller comme chip et confirmera (§Part B).
    let controllerScanner: QrScannerHandle | null = null;
    const openControllerScanner = (): void => {
      if (controllerScanner !== null) return; // déjà ouvert
      controllerScanner = startQrScanner({
        onCode: (code) => {
          controllerScanner = null;
          actingAsController = true;
          // Bascule immédiate en présentation controller shell (START DOM) — le scanner s'est déjà
          // fermé, on ne revient pas au menu title. Le toast « CONNECTED » suit au pairing.
          shellHost.setControllerMode(true);
          shellHost.showToast('CONNECTING…');
          pairing.joinAsController(code);
        },
        onError: (err) => {
          controllerScanner = null;
          console.warn('[AppHost] scanner caméra indisponible:', err);
          shellHost.showToast('CAMERA UNAVAILABLE');
        },
        onClose: () => {
          controllerScanner = null;
        },
      });
    };

    await renderApi.setSendToAsm(
      Comlink.proxy((event: AppEvent) => {
        // PLAY HERE / BRING IT BACK : l'autorité est orthogonale à l'AppState — l'événement
        // va à la FSM de handoff, jamais à l'orchestrateur (les transitions TRANSFER /
        // TRANSFER_BACK sont émises par la FSM au bon moment du protocole).
        if (event.type === 'REQUEST_HANDOFF') {
          handoff?.requestHandoff();
          return;
        }
        // « USE DEVICE AS CONTROLLER » : ouvre le scanner, ne touche pas à l'AppState (intercepté).
        if (event.type === 'USE_AS_CONTROLLER') {
          openControllerScanner();
          return;
        }
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
    // Le miroir searching ⇄ paired vers le prompt du title (setControllerPaired) vit dans le
    // câblage `onPhase` ci-dessus — ici on ne relaye que les changements d'écran.
    // Simulation (boids + Havok) — les DEUX rôles la spawnent et l'initialisent au boot
    // (préchauffe wasm ; le controller en a besoin dès le premier handoff, §B.5), mais seul
    // le device AUTORITÉ la démarre : à aucun instant deux sims ne steppent (CLAUDE.md §4).
    // Topologie selon le tier : worker dédié (`high`) ou hébergée dans le worker Render+Sim
    // (`low`) — même simHost derrière (src/sim/simHost.ts).
    let simControl: {
      readonly ready: Promise<void>;
      start(): void;
      stop(): void;
      /** Snapshot de handoff (§B.3) — le buffer revient par transfert. */
      capture(): Promise<ArrayBuffer>;
      /** Restaure un snapshot — le buffer part en transfert (inutilisable ensuite côté main). */
      restore(buf: ArrayBuffer): Promise<void>;
    };
    if (tier === 'high') {
      const simApi = Comlink.wrap<SimulationWorkerApi>(
        new Worker(new URL('../sim/simulation.worker.ts', import.meta.url), {
          type: 'module',
          name: 'SimulationWorker',
        }),
      );
      simControl = {
        // Buffers SAB relayés au render worker (mémoire partagée, zéro copie).
        ready: simApi.init(controlSab).then(async (buffers) => {
          await renderApi.attachGameBuffers(buffers);
        }),
        start: () => void simApi.start(),
        stop: () => void simApi.stop(),
        capture: () => simApi.capture(),
        restore: (buf) => simApi.restore(Comlink.transfer(buf, [buf])),
      };
    } else {
      simControl = {
        ready: renderApi.simInit(controlSab).then(() => undefined),
        start: () => void renderApi.simStart(),
        stop: () => void renderApi.simStop(),
        capture: () => renderApi.simCapture(),
        restore: (buf) => renderApi.simRestore(Comlink.transfer(buf, [buf])),
      };
    }
    // Erreur froide (wasm indisponible…) : loggée, le title reste fonctionnel — PLAY mènera
    // à une arène vide plutôt qu'à un boot cassé.
    simControl.ready.catch((err: unknown) => console.error('[AppHost] sim init failed:', err));

    handoff = createHandoffCoordinator({
      role: shellRole,
      sim: simControl,
      sendRequest: () => pairing.sendHandoffRequest(),
      sendState: (buf) => pairing.sendHandoffState(buf),
      sendAck: () => pairing.sendHandoffAck(),
      showToast: (msg) => shellHost.showToast(msg),
      // Avec les joysticks en DOM (transparents sur le canvas), il n'y a plus de fond opaque à
      // basculer : « game mode » est automatique. Le handoff-in (amener le jeu au tél.) réactivera
      // la présentation controller via le shell quand il sera câblé (§B.5, futur).
      setGamepadGameMode: () => {},
    });
    const boundHandoff = handoff;

    let lastScreenState: string | undefined;
    let lastSentScreen: string | undefined;
    appOrchestrator.subscribe((snapshot) => {
      if (snapshot.value === lastScreenState) return;
      const wasInGame = lastScreenState === 'IN_GAME';
      lastScreenState = snapshot.value as string;
      // PAIRING_MODE est un overlay shell DOM (main thread) : le worker ne le connaît plus, le
      // title reste affiché dessous. Et au retour (CLOSE_PAIRING) on ne renvoie pas l'écran déjà
      // affiché — ScreenManager rejouerait onLeave/onEnter, donc le reveal du title.
      if (snapshot.value !== 'PAIRING_MODE' && snapshot.value !== lastSentScreen) {
        lastSentScreen = snapshot.value as string;
        void renderApi.showScreen(snapshot.value as AppState);
      }
      if (snapshot.value === 'IN_GAME') {
        // Garde d'autorité (§B.1) : le controller entre aussi en IN_GAME au START croisé,
        // mais seul le device ACTIVE steppe — sa sim locale reste initialisée et figée. Un mobile
        // solo basculé en controller (`actingAsController`) ne steppe pas non plus : le receiver
        // distant est l'autorité.
        void simControl.ready.then(() => {
          if (!actingAsController && boundHandoff.isActive()) simControl.start();
        });
      } else if (wasInGame) {
        simControl.stop();
        // §A.6 : pas d'axes fantômes à la reprise (pause, handoff) — la sim est arrêtée
        // mais le SAB garde sa dernière valeur sinon.
        writeAxes(controlView, 0, 0);
      }
    });
    appOrchestrator.startUp();

    // `?dev` (build DEV seulement — en prod ce bloc est tree-shaké et la garde `hasController`
    // reste le seul chemin vers IN_GAME) : controller simulé pour débloquer PLAY + pilotage
    // clavier de la sphère de contrôle, comme en monolith.
    if (import.meta.env.DEV && flags?.dev && shellRole === 'receiver') {
      appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
      void renderApi.setControllerPaired('DEV');
      const { attachKeyboardSimControls, attachSnapshotDevKeys } = await import(
        '../_dev/inspectors/simControls'
      );
      // Le clavier dev emprunte le pipeline prod (SAB + dispatcher), pas un canal parallèle.
      attachKeyboardSimControls((x, z) => writeAxes(controlView, x, z));
      // C/R : round-trip de snapshot via la vraie surface Comlink (transfert compris).
      attachSnapshotDevKeys(
        () => simControl.capture(),
        (buf) => simControl.restore(buf),
      );
    }

    // Mobile en URL de base : ce device est à la fois l'affichage ET sa propre manette. On débloque
    // PLAY (garde `hasController`) sans pairing — les joysticks tactiles locaux écrivent le SAB via
    // l'autorité locale (voir `isLocalAuthority` ci-dessus). Le title passe direct à « START GAME ».
    if (selfControlled) {
      appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
      void renderApi.setControllerPaired(deviceName);
    }

    // Un device controller boote directement sur l'interface de pairing plein écran, et le shell
    // le met en mode controller (START DOM après pairing, plus de menu title Pixi).
    if (ctx.role === 'controller') {
      shellHost.setControllerMode(true);
      appOrchestrator.send({ type: 'OPEN_PAIRING' });
    }

    // Gate d'orientation (mobile) : le jeu se joue en landscape. iOS Safari ne peut pas verrouiller
    // l'orientation en onglet → prompt visuel réactif (shell `RotateGate` DOM). Détection côté main
    // (`matchMedia`). En portrait, on remet les axes à zéro (soft-pause) pour ne pas laisser le
    // flock filer sous l'overlay.
    if (selfControlled || ctx.role === 'controller') {
      const portraitMq = window.matchMedia('(orientation: portrait)');
      const applyOrientation = (): void => {
        const portrait = portraitMq.matches;
        shellHost.setPortrait(portrait);
        if (portrait) writeAxes(controlView, 0, 0);
      };
      portraitMq.addEventListener('change', applyOrientation);
      applyOrientation();
    }

    mountEventHandlers({ canvas, renderWorker });
    setupPwaExperience(ctx.runtime, () => overGameUI);

    return { assetsManager, renderApi };
  }
}
