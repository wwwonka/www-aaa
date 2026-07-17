// Connecte l'AppState (machine `appOrchestrator`) au rendu et à la simulation : à chaque
// changement d'écran, pousse `showScreen` au render worker (dédupé), et démarre/arrête la sim
// aux entrées/sorties d'IN_GAME. La sim ne steppe que si ce device est l'AUTORITÉ (§B.1) et
// n'agit pas comme controller distant. Aucune logique d'écran ici — juste le câblage réactif.

import type { Remote } from 'comlink';
import { appOrchestrator } from '../../core/AppOrchestrator';
import type { AppState } from '../../core/AppOrchestrator';
import type { RenderWorkerApi } from '../../render/render.worker';
import type { SimControl } from './simControl';
import type { HandoffCoordinator } from '../HandoffCoordinator';
import { writeAxes } from '../../input/transport/controlChannel';
import { removeBootSplash } from './bootSplash';

export function setupScreens(deps: {
  readonly renderApi: Remote<RenderWorkerApi>;
  readonly sim: SimControl;
  readonly handoff: HandoffCoordinator;
  /** `true` si ce device a basculé en controller distant (sa sim locale ne doit pas stepper). */
  readonly isActingAsController: () => boolean;
  readonly controlView: Int32Array;
}): void {
  const { renderApi, sim, handoff, isActingAsController, controlView } = deps;

  let lastScreenState: string | undefined;
  let lastSentScreen: string | undefined;

  appOrchestrator.subscribe((snapshot) => {
    // xstate ré-émet un snapshot à chaque `.send()` (dont les ASSET_PROGRESS du warmUp) → dédup
    // sur la valeur d'écran, sinon `showScreen` (et donc playAnimation) se déclencherait par asset.
    if (snapshot.value === lastScreenState) return;
    const wasInGame = lastScreenState === 'IN_GAME';
    lastScreenState = snapshot.value as string;

    // PAIRING_MODE est un overlay shell DOM (main thread) : le worker ne le connaît plus, le title
    // reste affiché dessous. Au retour (CLOSE_PAIRING) on ne renvoie pas l'écran déjà affiché —
    // ScreenManager rejouerait onLeave/onEnter, donc le reveal du title.
    if (snapshot.value !== 'PAIRING_MODE' && snapshot.value !== lastSentScreen) {
      lastSentScreen = snapshot.value as string;
      // Le splash statique (boot-splash.html) tombe au premier écran réellement monté dans le canvas.
      void renderApi.showScreen(snapshot.value as AppState).then(removeBootSplash);
    }

    if (snapshot.value === 'IN_GAME') {
      // Garde d'autorité (§B.1) : le controller entre aussi en IN_GAME au START croisé, mais seul le
      // device ACTIVE steppe — sa sim locale reste initialisée et figée.
      void sim.ready.then(() => {
        if (!isActingAsController() && handoff.isActive()) sim.start();
      });
    } else if (wasInGame) {
      sim.stop();
      // §A.6 : pas d'axes fantômes à la reprise (pause, handoff) — sinon le SAB garde sa dernière valeur.
      writeAxes(controlView, 0, 0);
    }
  });
}
