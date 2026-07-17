// Comment ce device devient jouable SANS controller distant (pas de pairing téléphone). Deux voies :
//  - solo mobile (`selfControlled`) : il est son propre controller tactile → débloque PLAY + gate
//    d'orientation (le jeu se joue en landscape) ;
//  - manette locale branchée (desktop) : elle débloque PLAY exactement comme un pairing téléphone.
// Dans les deux cas, l'autorité est déjà locale (receiver = ACTIVE), donc les axes du hub écrivent
// le SAB local. Toutes ces actions sont des effets de bord de boot (aucune valeur retournée).

import type { Remote } from 'comlink';
import { appOrchestrator } from '../../core/AppOrchestrator';
import type { RenderWorkerApi } from '../../render/render.worker';
import type { ShellHost } from '../shell/ShellHost';
import { writeAxes } from '../../input/transport/controlChannel';

export function setupSoloMode(deps: {
  readonly selfControlled: boolean;
  readonly renderApi: Remote<RenderWorkerApi>;
  readonly shellHost: ShellHost;
  readonly controlView: Int32Array;
  readonly deviceName: string;
}): void {
  const { selfControlled, renderApi, shellHost, controlView, deviceName } = deps;

  if (selfControlled) {
    // Mobile en URL de base : ce device est à la fois l'affichage ET sa propre manette. On débloque
    // PLAY (garde `hasController`) sans pairing — le title passe direct à « START GAME ».
    appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
    void renderApi.setControllerPaired(deviceName);

    // Gate d'orientation : le jeu se joue en landscape ; iOS Safari ne verrouille pas en onglet →
    // prompt visuel réactif (RotateGate DOM). En portrait, on remet les axes à zéro (soft-pause)
    // pour ne pas laisser le flock filer sous l'overlay.
    const portraitMq = window.matchMedia('(orientation: portrait)');
    const applyOrientation = (): void => {
      const portrait = portraitMq.matches;
      shellHost.setPortrait(portrait);
      if (portrait) writeAxes(controlView, 0, 0);
    };
    portraitMq.addEventListener('change', applyOrientation);
    applyOrientation();
    return; // solo mobile et manette-desktop sont mutuellement exclusifs
  }

  // Desktop : une manette branchée débloque PLAY, comme un pairing téléphone (même commande).
  let gamepadAnnounced = false;
  window.addEventListener('gamepadconnected', (e) => {
    // NB : le navigateur n'émet cet event qu'après une PREMIÈRE pression bouton (vie privée).
    console.log(
      `[AppHost] 🎮 manette détectée : "${e.gamepad.id}" — mapping ${e.gamepad.mapping || 'NON-standard (ignorée par GamepadSource)'}`,
    );
    if (gamepadAnnounced) return;
    gamepadAnnounced = true;
    appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
    void renderApi.setControllerPaired('GAMEPAD');
    console.log('[AppHost] 🎮 CONTROLLER_CONNECTED émis → le title doit passer à « START GAME ».');
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    console.log(`[AppHost] 🎮 manette débranchée : "${e.gamepad.id}"`);
  });
}
