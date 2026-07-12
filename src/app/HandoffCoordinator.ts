// FSM d'autorité du handoff bidirectionnel (docs/progress/design-etapes-5-6.md §B.1/B.2) —
// main thread, orthogonale au rôle receiver/controller : c'est l'AUTORITÉ qui compte
// (CLAUDE.md §4, autorité unique). Règles non négociables : la sim ne steppe jamais hors
// d'ACTIVE ; l'autorité n'est cédée qu'à réception de l'ACK ; la scène Babylon locale n'est
// jamais détruite (masquée/réaffichée par l'orchestrateur d'écrans).
import { appOrchestrator } from '../core/AppOrchestrator';
import type { PeerRole } from '../input/signaling/types';

export type AuthorityState = 'ACTIVE' | 'CAPTURING' | 'AWAITING_ACK' | 'PASSIVE' | 'RESTORING';

const HANDOFF_TIMEOUT_MS = 5000;

/** Sous-ensemble de la façade `simControl` d'AppHost dont la FSM a besoin. */
export interface HandoffSimControl {
  readonly ready: Promise<void>;
  start(): void;
  stop(): void;
  capture(): Promise<ArrayBuffer>;
  restore(buf: ArrayBuffer): Promise<void>;
}

export interface HandoffCoordinatorDeps {
  readonly role: PeerRole;
  readonly sim: HandoffSimControl;
  /** Envois réseau vers le peer pairé (no-op si non pairé) — fournis par pairingHost. */
  sendRequest(): void;
  sendState(buf: ArrayBuffer): void;
  sendAck(): void;
  showToast(message: string): void;
  /** Controller uniquement : bascule le GamepadScreen entre fond opaque et jeu visible (§B.5). */
  setGamepadGameMode(active: boolean): void;
}

export interface HandoffCoordinator {
  /** Le device local (PASSIF) demande l'autorité — PLAY HERE / BRING IT BACK. */
  requestHandoff(): void;
  /** `hoReq` reçu du peer pairé. */
  onRemoteRequest(): void;
  /** `hoState` reçu — snapshot §B.3, copie détachée du buffer Trystero. */
  onRemoteState(buf: ArrayBuffer): void;
  /** `hoAck` reçu — l'autorité est cédée pour de bon. */
  onRemoteAck(): void;
  /** Le peer pairé a quitté la room — rollback si un transfert était en cours. */
  onPeerLost(): void;
  /** Le sampler d'input (pairingHost) route local vs réseau selon ce flag (§B.5). */
  isActive(): boolean;
}

export function createHandoffCoordinator(deps: HandoffCoordinatorDeps): HandoffCoordinator {
  const { role, sim } = deps;
  // Autorité initiale : le receiver héberge la partie (CLAUDE.md §4), le controller attend.
  let state: AuthorityState = role === 'receiver' ? 'ACTIVE' : 'PASSIVE';
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  // Demandeur en attente de hoState : pas un état FSM (on reste PASSIVE), juste une garde.
  let awaitingState = false;

  const clearTimer = (): void => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
  };

  const armTimer = (onTimeout: () => void): void => {
    clearTimer();
    timeoutId = setTimeout(onTimeout, HANDOFF_TIMEOUT_MS);
  };

  // L'ex-autorité redevient jouable : re-start local + toast (peer perdu ou ACK jamais arrivé).
  const rollbackToActive = (reason: string): void => {
    clearTimer();
    state = 'ACTIVE';
    sim.start();
    deps.showToast(reason);
  };

  const becamePassive = (): void => {
    clearTimer();
    state = 'PASSIVE';
    // Côté receiver l'AppState pilote l'écran PLAYING_ON_PHONE (et le masquage du jeu via
    // showScreen) ; côté controller l'AppState ne bouge pas, seul le fond du gamepad change.
    if (role === 'receiver') appOrchestrator.send({ type: 'TRANSFER' });
    else deps.setGamepadGameMode(false);
  };

  const becameActive = (): void => {
    state = 'ACTIVE';
    sim.start();
    deps.sendAck();
    if (role === 'receiver') appOrchestrator.send({ type: 'TRANSFER_BACK' });
    else deps.setGamepadGameMode(true);
    deps.showToast('GAME IS PLAYING HERE');
  };

  return {
    requestHandoff(): void {
      if (state !== 'PASSIVE' || awaitingState) return;
      awaitingState = true;
      deps.sendRequest();
      // Requête ignorée (autorité en transition, peer pas en jeu…) : on retombe sur timeout.
      armTimer(() => {
        awaitingState = false;
        deps.showToast('TRANSFER FAILED — TRY AGAIN');
      });
    },

    onRemoteRequest(): void {
      // Un device en transition ignore tout hoReq entrant (§B.6, hoReq croisés : l'autorité
      // courante gagne). Hors IN_GAME (title, pairing, pause), rien à transférer — le
      // demandeur retombera sur son timeout.
      if (state !== 'ACTIVE') return;
      if ((appOrchestrator.getSnapshot().value as string) !== 'IN_GAME') return;
      state = 'CAPTURING';
      // Stop AVANT capture : à aucun instant deux sims ne steppent (§B.1) — l'état est figé.
      sim.stop();
      sim
        .capture()
        .then((buf) => {
          if (state !== 'CAPTURING') return; // peer perdu entre-temps
          deps.sendState(buf);
          state = 'AWAITING_ACK';
          armTimer(() => rollbackToActive('TRANSFER FAILED — RESUMING HERE'));
        })
        .catch((err: unknown) => {
          console.error('[handoff] capture failed:', err);
          rollbackToActive('TRANSFER FAILED — RESUMING HERE');
        });
    },

    onRemoteState(buf: ArrayBuffer): void {
      if (state !== 'PASSIVE') return;
      awaitingState = false;
      clearTimer();
      state = 'RESTORING';
      sim.ready
        .then(() => sim.restore(buf))
        .then(() => {
          // Peer perdu pendant RESTORING : on termine et on reste ACTIVE — le jeu vit ici
          // désormais (§B.6), le toast « connexion perdue » est parti via onPeerLost.
          becameActive();
        })
        .catch((err: unknown) => {
          // Snapshot incompatible ou restore cassé : on refuse l'autorité, l'ex-autorité
          // retombera sur son timeout d'ACK et fera rollback.
          console.error('[handoff] restore failed:', err);
          state = 'PASSIVE';
          deps.showToast('TRANSFER FAILED');
        });
    },

    onRemoteAck(): void {
      if (state !== 'AWAITING_ACK') return;
      becamePassive();
    },

    onPeerLost(): void {
      awaitingState = false;
      if (state === 'AWAITING_ACK' || state === 'CAPTURING') {
        rollbackToActive('CONTROLLER LOST — RESUMING HERE');
      } else if (state === 'RESTORING') {
        // Rien : le then() de restore terminera en ACTIVE (§B.6).
      } else if (
        state === 'PASSIVE' &&
        role === 'receiver' &&
        (appOrchestrator.getSnapshot().value as string) === 'PLAYING_ON_PHONE'
      ) {
        // L'autorité a disparu pendant que le jeu vivait sur le phone : la reconnexion est
        // hors scope (brief §5) mais on ne laisse pas un écran mort — le receiver reprend
        // avec son dernier état local (celui d'avant le transfert).
        state = 'ACTIVE';
        sim.start();
        appOrchestrator.send({ type: 'TRANSFER_BACK' });
        deps.showToast('CONTROLLER LOST — RESUMING HERE');
      } else {
        clearTimer();
      }
    },

    isActive: (): boolean => state === 'ACTIVE',
  };
}
