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

    // Même holder qu'AppHost pour la dépendance circulaire shell ⇄ pairing : les callbacks du
    // shell lisent `pairing` bien après son affectation.
    const shellHost = new ShellHost({
      usesTouchInput: true,
      onInput: (x, z) => pairing.sendInput(x, z),
      onStart: () => {
        // START : lance la partie ET propage au receiver pairé (le `onStart` distant n'émet
        // que le PLAY local, pas d'écho).
        pairing.notifyLocalPlay();
        appOrchestrator.send({ type: 'PLAY' });
      },
      pairing: { role: 'controller', pageUrl, roomCode, deviceName },
    });
    shellHost.setControllerMode(true);

    const pairing: PairingHost = setupPairingHost({
      role: 'controller',
      roomCode,
      deviceName,
      onPhase: (status) => shellHost.setPairingStatus(status),
      showToast: (message) => shellHost.showToast(message),
      // Pas d'`applyAxes`/`isLocalAuthority` : aucune sim locale — l'input va toujours en RTC.
    });

    appOrchestrator.startUp();
    // Boot directement sur le pairing plein écran (join immédiat, voir pairingHost).
    appOrchestrator.send({ type: 'OPEN_PAIRING' });

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
