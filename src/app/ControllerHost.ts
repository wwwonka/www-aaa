import { installBrowserGuards } from './guards/_index';
import type { AppContext } from './platform/ContextManager';
import { registerServiceWorker } from './platform/serviceWorkerRegister';
import { setupPwaExperience } from './platform/pwa/_index';
import { appOrchestrator } from '../core/AppOrchestrator';
import type { QueryFlags } from './platform/queryFlags';
import { setupPairingHost } from './pairingHost';
import type { PairingHost } from './pairingHost';
import { ShellHost } from './shell/ShellHost';
import { generateDeviceName } from '../input/signaling/identity';
import { runWhenIdle } from './platform/idle';
import { removeBootSplash } from './boot/bootSplash';
// URLs des chunks lourds SANS leur code (suffixes Vite `?worker&url` / `?url` — de simples
// strings dans ce chunk) : le prefetch post-pairing ne doit rien instancier (D3).
import renderWorkerUrl from '../render/render.worker.ts?worker&url';
import simulationWorkerUrl from '../sim/simulation.worker.ts?worker&url';
import havokWasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';

/**
 * Boot d'un device controller pur (`?r=CODE` scanné, `?controller`, ou rôle persisté) — le
 * pendant léger d'`AppHost`. Tout est shell DOM sur le main thread : pairing plein écran,
 * START, joysticks, gate d'orientation. **Aucun** render worker, sim, SAB ni benchmark — c'est
 * LE chemin critique du scan QR mobile, il ne doit tirer ni Babylon/Pixi ni Havok (garde de
 * légèreté : Playwright vérifie qu'aucune requête render/sim ne part sur `?r=`).
 *
 * L'input part toujours en RTC vers le receiver pairé (pas de sim locale — `sendInput` est
 * no-op tant que le pairing n'a pas abouti). Le handoff-in (« amener le jeu au téléphone »)
 * chargera les chunks lourds plus tard, en idle après pairing (PR 3).
 */
export class ControllerHost {
  /**
   * @param flags - Flags de boot parsés depuis l'URL (`?r=CODE` → room à rejoindre).
   * @param ctx - Contexte détecté par `main.ts` (routing) — évite une double détection.
   */
  start(flags: QueryFlags | undefined, ctx: AppContext): void {
    installBrowserGuards();
    void registerServiceWorker(ctx.runtime);

    // Identité de session (jamais persistée) : le code de room vient du QR scanné (`?r=`) —
    // `null` (URL `?controller` tapée à la main) laisse l'overlay en searching sans join.
    const roomCode = flags?.roomCode ?? null;
    const deviceName = generateDeviceName();
    const pageUrl = `${window.location.origin}${window.location.pathname}`;

    // SCAN AGAIN : ré-ouvre le scanner caméra pour capter un NOUVEAU code (room morte → RETRY seul
    // ne peut pas aboutir). `qrScanner` en import dynamique — la lib caméra reste hors du boot léger.
    let scanning = false;
    const scanAgain = (): void => {
      if (scanning) return;
      scanning = true;
      void import('../input/signaling/qrScanner').then(({ startQrScanner }) => {
        startQrScanner({
          onCode: (code) => {
            scanning = false;
            shellHost.showToast('CONNECTING…');
            pairing.joinAsController(code); // même room-switch propre que « USE AS CONTROLLER »
          },
          onError: (err) => {
            scanning = false;
            console.warn('[ControllerHost] scanner caméra indisponible:', err);
            shellHost.showToast('CAMERA UNAVAILABLE');
          },
          onClose: () => {
            scanning = false;
          },
        });
      });
    };

    // Même holder qu'AppHost pour la dépendance circulaire shell ⇄ pairing : les callbacks du shell
    // lisent `pairing` bien après son affectation. ShellHost construit le hub d'input (mêmes sources
    // partout — manette + tactile) autour du sink : sur le controller, `pairing.sendInput` part
    // toujours en RTC vers le receiver pairé (pas de sim locale).
    const shellHost = new ShellHost({
      usesTouchInput: true,
      axisSink: (x, z) => pairing.sendInput(x, z),
      onStart: () => {
        // START : lance la partie ET propage au receiver pairé (le `onStart` distant n'émet
        // que le PLAY local, pas d'écho).
        pairing.notifyLocalPlay();
        appOrchestrator.send({ type: 'PLAY' });
      },
      pairing: {
        role: 'controller',
        pageUrl,
        roomCode,
        deviceName,
        onRetry: () => pairing.retry(),
        onScanAgain: scanAgain,
      },
    });
    shellHost.setControllerMode(true);

    // Après pairing : chauffe le cache HTTP/SW des chunks lourds (render, sim, Havok wasm)
    // en idle, fetch-only — pas de worker, pas de compile wasm (D3). Le futur handoff-in
    // (« amener le jeu au téléphone ») trouvera les octets déjà locaux. Opportuniste : un
    // échec réseau est avalé, le handoff re-fetchera au besoin.
    let prefetched = false;
    const prefetchHeavyChunks = (): void => {
      if (prefetched) return;
      prefetched = true;
      runWhenIdle(() => {
        for (const url of [renderWorkerUrl, simulationWorkerUrl, havokWasmUrl])
          void fetch(url).catch(() => undefined);
      });
    };

    const pairing: PairingHost = setupPairingHost({
      role: 'controller',
      roomCode,
      deviceName,
      onPhase: (status) => {
        shellHost.setPairingStatus(status);
        if (status.phase === 'paired') prefetchHeavyChunks();
      },
      showToast: (message) => shellHost.showToast(message),
      // Pas d'`applyAxes`/`isLocalAuthority` : aucune sim locale — l'input va toujours en RTC.
    });

    appOrchestrator.startUp();
    // Boot directement sur le pairing plein écran (join immédiat, voir pairingHost).
    appOrchestrator.send({ type: 'OPEN_PAIRING' });
    // L'overlay shell est monté et actif (synchrone) — le splash statique a fini son travail.
    removeBootSplash();

    // Gate d'orientation : le jeu se joue en landscape (iOS Safari ne verrouille pas en onglet).
    // En portrait, on envoie des axes nuls (§A.6) — le flock du receiver ne doit pas filer sur
    // la dernière direction reçue pendant que le joueur tourne son téléphone.
    const portraitMq = window.matchMedia('(orientation: portrait)');
    const applyOrientation = (): void => {
      const portrait = portraitMq.matches;
      shellHost.setPortrait(portrait);
      if (portrait) pairing.sendInput(0, 0);
    };
    portraitMq.addEventListener('change', applyOrientation);
    applyOrientation();

    // Pas de survol d'UI Pixi ici (aucun canvas actif) — le getter est constant.
    setupPwaExperience(ctx.runtime, () => false);
  }
}
