// Tout le câblage de « contrôle » du device receiver : le shell DOM, le hub d'input (tactile +
// manette), le pairing réseau (téléphone), la FSM d'autorité (handoff), le scanner QR « use as
// controller », et l'interception `setSendToAsm` (events venus du render worker). Ces morceaux sont
// mutuellement intriqués (circularité shell ⇄ pairing, holders `handoff`/`actingAsController`
// remplis tardivement) → ils vivent ensemble ici, la circularité restant INTERNE à ce module.

import * as Comlink from 'comlink';
import type { Remote } from 'comlink';
import { appOrchestrator } from '../../core/AppOrchestrator';
import type { AppEvent } from '../../core/AppOrchestrator';
import type { RenderWorkerApi } from '../../render/render.worker';
import { setupPairingHost } from '../pairingHost';
import type { PairingHost } from '../pairingHost';
import { ShellHost } from '../shell/ShellHost';
import { startQrScanner, type QrScannerHandle } from '../../input/signaling/qrScanner';
import { createHandoffCoordinator } from '../HandoffCoordinator';
import type { HandoffCoordinator } from '../HandoffCoordinator';
import { writeAxes } from '../../input/transport/controlChannel';
import type { InputHub } from '../../input/InputHub';
import type { SimControl } from './simControl';
import type { PeerRole } from '../../input/signaling/types';

export interface PairingSetup {
  readonly shellHost: ShellHost;
  readonly pairing: PairingHost;
  readonly handoff: HandoffCoordinator;
  readonly inputHub: InputHub;
  /** `true` si ce device a basculé en controller distant (« use as controller »). */
  readonly isActingAsController: () => boolean;
}

export async function setupPairing(deps: {
  readonly renderApi: Remote<RenderWorkerApi>;
  readonly controlView: Int32Array;
  readonly sim: SimControl;
  readonly selfControlled: boolean;
  readonly shellRole: PeerRole;
  readonly roomCode: string;
  readonly deviceName: string;
  readonly pageUrl: string;
}): Promise<PairingSetup> {
  const { renderApi, controlView, sim, selfControlled, shellRole, roomCode, deviceName, pageUrl } =
    deps;

  // FSM d'autorité (§B.1) — assignée après le pairing ; ses callbacks la referment en `let` (le
  // canal ne reçoit un handoff qu'après join → paired, jamais avant).
  let handoff: HandoffCoordinator | null = null;

  // « USE DEVICE AS CONTROLLER » : un mobile solo (selfControlled) bascule en controller après avoir
  // scanné le QR d'un autre écran. Ce flag DÉSARME l'autorité locale — l'input part en RTC vers le
  // receiver distant, et la sim locale ne steppe pas.
  let actingAsController = false;

  // ShellHost construit le hub d'input (manette + tactile) autour du sink `pairing.sendInput` (SAB
  // local si autorité, sinon RTC) et pilote son cycle de vie. `pairing` est lu paresseusement (const
  // assigné plus bas — circularité shell ⇄ pairing interne à ce module).
  const shellHost = new ShellHost({
    usesTouchInput: selfControlled,
    axisSink: (x, z) => pairing.sendInput(x, z),
    onStart: () => {
      // START shell (controller) : lance la partie ET propage au peer pairé (sync, comme le PLAY
      // intercepté dans setSendToAsm) — le receiver enchaîne sur IN_GAME.
      pairing.notifyLocalPlay();
      appOrchestrator.send({ type: 'PLAY' });
    },
    // SCAN AGAIN est réservé au controller pur (overlay receiver → RETRY seul, sur sa propre room).
    pairing: { role: shellRole, pageUrl, roomCode, deviceName, onRetry: () => pairing.retry() },
  });
  const inputHub = shellHost.inputHub;

  const pairing: PairingHost = setupPairingHost({
    showToast: (message) => shellHost.showToast(message),
    role: shellRole,
    roomCode,
    deviceName,
    onPhase: (status): void => {
      shellHost.setPairingStatus(status);
      // Miroir vers le prompt du Title Pixi (« CONNECT A CONTROLLER » ⇄ « START GAME »).
      if (status.phase === 'paired') void renderApi.setControllerPaired(status.peerName);
      else if (status.phase === 'searching') void renderApi.setControllerPaired(null);
    },
    // Axes → SAB local (policy latest-wins, pipeline §7 de bout en bout).
    applyAxes: (x, z): void => writeAxes(controlView, x, z),
    // Solo mobile : ce device EST l'autorité en permanence → les joysticks écrivent le SAB local.
    // Sauf s'il a basculé en controller (`actingAsController`) : l'input part alors en RTC. Sinon,
    // l'autorité suit la FSM de handoff (§B.5).
    isLocalAuthority: () => !actingAsController && (selfControlled || (handoff?.isActive() ?? false)),
    onHandoffRequest: () => handoff?.onRemoteRequest(),
    onHandoffState: (buf) => handoff?.onRemoteState(buf),
    onHandoffAck: () => handoff?.onRemoteAck(),
    onPairedPeerLost: () => handoff?.onPeerLost(),
  });

  // Scanner QR in-app (« USE DEVICE AS CONTROLLER ») — overlay DOM caméra (main thread). Au scan d'un
  // QR de receiver, on isole le code de room et on rejoint à chaud en controller.
  let controllerScanner: QrScannerHandle | null = null;
  const openControllerScanner = (): void => {
    if (controllerScanner !== null) return; // déjà ouvert
    controllerScanner = startQrScanner({
      onCode: (code) => {
        controllerScanner = null;
        actingAsController = true;
        // Bascule immédiate en présentation controller shell (START DOM) — pas de retour au title.
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
      // PLAY HERE / BRING IT BACK : l'autorité est orthogonale à l'AppState — l'événement va à la FSM
      // de handoff, jamais à l'orchestrateur (TRANSFER / TRANSFER_BACK sont émis par la FSM).
      if (event.type === 'REQUEST_HANDOFF') {
        handoff?.requestHandoff();
        return;
      }
      // « USE DEVICE AS CONTROLLER » : ouvre le scanner, ne touche pas à l'AppState (intercepté).
      if (event.type === 'USE_AS_CONTROLLER') {
        openControllerScanner();
        return;
      }
      // Un PLAY local (START GAME / START) lance aussi la partie sur le peer pairé (l'action réseau
      // part d'ici ; le `onStart` distant n'émet que le PLAY local, pas d'écho).
      if (event.type === 'PLAY') pairing.notifyLocalPlay();
      appOrchestrator.send(event);
    }),
  );

  handoff = createHandoffCoordinator({
    role: shellRole,
    sim,
    sendRequest: () => pairing.sendHandoffRequest(),
    sendState: (buf) => pairing.sendHandoffState(buf),
    sendAck: () => pairing.sendHandoffAck(),
    showToast: (msg) => shellHost.showToast(msg),
    // Joysticks en DOM (transparents sur le canvas) → plus de fond opaque à basculer : « game mode »
    // automatique. Le handoff-in (amener le jeu au tél.) réactivera la présentation controller (futur).
    setGamepadGameMode: () => {},
  });
  const boundHandoff = handoff;

  return {
    shellHost,
    pairing,
    handoff: boundHandoff,
    inputHub,
    isActingAsController: () => actingAsController,
  };
}
