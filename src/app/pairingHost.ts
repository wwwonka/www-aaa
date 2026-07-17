import { createActor } from 'xstate';
import { appOrchestrator } from '../core/AppOrchestrator';
import { getIceServers } from '../input/signaling/iceServers';
import { connectionMachine, derivePhase } from '../input/signaling/connectionMachine';
import type { ConnectionPorts } from '../input/signaling/connectionMachine';
import type { PairingChannel, PairingStatus, PeerRole } from '../input/signaling/types';
import { decodeInput, encodeInput } from '../input/transport/inputCodec';
import type { DecodedInput } from '../input/transport/inputCodec';
import { INPUT_PAYLOAD_BYTES } from '../shared/constants';

export interface PairingHostOptions {
  readonly role: PeerRole;
  /** Code de session — généré côté receiver, lu depuis `?r=` côté controller (`null` = pas de room, on reste en searching). */
  readonly roomCode: string | null;
  readonly deviceName: string;
  /**
   * Phase du cycle de pairing — **source unique de vérité**, poussée vers l'UI (shell DOM, et
   * prompt du title Pixi via le câblage AppHost). Le pairing ne dépend plus du render worker.
   */
  readonly onPhase: (status: PairingStatus) => void;
  /** Notification transitoire — vers le shell DOM (`ShellHost.showToast`), plus le worker Pixi. */
  readonly showToast: (message: string) => void;
  /**
   * Écrit des axes dans le SAB de contrôle local (`writeAxes`). Deux producteurs possibles,
   * jamais simultanés (§B.5, un seul chemin d'écriture) : l'input `input` du peer pairé quand
   * ce device est l'autorité, ou les joysticks locaux du controller quand LUI est l'autorité.
   */
  readonly applyAxes?: (dirX: number, dirZ: number) => void;
  /** Switch d'autorité du sampler (§B.5) — `true` = les sticks écrivent local, pas de réseau. */
  readonly isLocalAuthority?: () => boolean;
  /** Callbacks du protocole de handoff (§B.2), déjà filtrés par peer pairé. */
  readonly onHandoffRequest?: () => void;
  readonly onHandoffState?: (buf: ArrayBuffer) => void;
  readonly onHandoffAck?: () => void;
  /** Le peer PAIRÉ a quitté la room (déjà filtré) — rollback éventuel côté FSM d'autorité. */
  readonly onPairedPeerLost?: () => void;
}

export interface PairingHost {
  /** À appeler quand le device local lance la partie — propage `start` au peer pairé. */
  notifyLocalPlay(): void;
  /** Envois du protocole de handoff vers le peer pairé — no-op si non pairé (§B.2). */
  sendHandoffRequest(): void;
  sendHandoffState(buf: ArrayBuffer): void;
  sendHandoffAck(): void;
  /** Reprise manuelle depuis l'UI d'erreur (RETRY) — relance une passe de connexion. */
  retry(): void;
  /**
   * « USE DEVICE AS CONTROLLER » : bascule ce device (un mobile solo, rôle receiver au boot) en
   * controller et rejoint à chaud la room scannée. Le receiver distant, en pairing, découvrira
   * ce controller comme chip et confirmera. Voir `AppHost` (flag `actingAsController`).
   */
  joinAsController(roomCode: string): void;
  /**
   * Sink d'input des joysticks DOM (main thread). Switch d'autorité §B.5 : si ce device EST
   * l'autorité, les axes vont au SAB local ; sinon ils partent en RTC au peer pairé (no-op tant
   * que non pairé).
   */
  sendInput(dirX: number, dirZ: number): void;
}

/**
 * Câble le canal de pairing (main thread, contrainte WebRTC) à la {@link connectionMachine} et au
 * shell DOM. La machine possède la LIVENESS (recherche, handshake, timeouts, erreurs, reprise) ;
 * `pairingHost` fait le câblage : les callbacks du canal deviennent des events de la machine, et
 * les ports de la machine appellent le canal. Controller : `OPEN` au boot. Receiver : `OPEN` à
 * l'ouverture de `PAIRING_MODE`, `CLOSE` si la sheet se ferme (no-op une fois pairé).
 */
export function setupPairingHost(options: PairingHostOptions): PairingHost {
  const { role, roomCode, deviceName, onPhase, applyAxes, isLocalAuthority } = options;

  // Rôle EFFECTIF du canal : `role` au boot, mais un mobile solo (receiver) peut basculer en
  // controller au runtime via `joinAsController` (« USE DEVICE AS CONTROLLER »).
  let effectiveRole: PeerRole = role;
  // Room courante — mutable : `joinAsController` en change au runtime.
  let currentRoomCode: string | null = roomCode;

  let channel: PairingChannel | null = null;
  let creating = false;

  // Transport input ~30 Hz (§A.3/A.6) : tampons réutilisés, zéro allocation par envoi.
  const inputPayload = new Uint8Array(INPUT_PAYLOAD_BYTES);
  const inputPayloadView = new DataView(inputPayload.buffer);
  const decodedInput: DecodedInput = { dirX: 0, dirZ: 0, seq: 0 };
  let inputSeq = 0;

  // Peer courant (découvert ou pairé) selon la machine ; `paired` seulement quand la connexion tient.
  const currentPeerId = (): string | null => actor.getSnapshot().context.peer?.id ?? null;
  const pairedPeerId = (): string | null => {
    const snap = actor.getSnapshot();
    return snap.value === 'paired' ? (snap.context.peer?.id ?? null) : null;
  };

  // Crée le canal Trystero (import dynamique D5 + résolution ICE) puis notifie la machine. Idempotent
  // et annulable : un CLOSE pendant l'await (retour en `idle`) ne laisse pas de canal fantôme.
  const openChannel = async (): Promise<void> => {
    if (channel !== null || creating || currentRoomCode === null) return;
    const rid = currentRoomCode;
    creating = true;
    const [{ createTrysteroPairingChannel }, iceServers] = await Promise.all([
      import('../input/signaling/PairingChannel'),
      getIceServers(),
    ]);
    creating = false;
    if (actor.getSnapshot().value !== 'joining') return; // annulé (CLOSE) pendant l'await
    channel = createTrysteroPairingChannel({
      role: effectiveRole,
      roomId: rid,
      deviceName,
      iceServers,
      callbacks: {
        onPeerDiscovered: (peer): void => {
          // Auto-pairing : un controller a scanné le QR du receiver — le scan EST la confirmation,
          // on connecte dès la découverte (handshaking). Le receiver, lui, attend le `connect`
          // entrant (chip affiché) ; le tap-sur-pastille (futur) enverrait aussi INITIATE_PAIR.
          if (effectiveRole === 'controller') actor.send({ type: 'INITIATE_PAIR', peer });
          else actor.send({ type: 'PEER_APPEARED', peer });
        },
        onPeerLost: (peerId): void => {
          if (peerId === currentPeerId()) actor.send({ type: 'PEER_LOST' });
        },
        // Receiver : refuse un controller surnuméraire (déjà pairé) → le canal répond `busy`.
        onPairRequest: (): boolean => actor.getSnapshot().value !== 'paired',
        onBusy: (): void => actor.send({ type: 'BUSY' }),
        onVersionMismatch: (): void => {
          actor.send({ type: 'VERSION_MISMATCH' });
          options.showToast('VERSION MISMATCH — RELOAD');
        },
        onPaired: (peer): void => actor.send({ type: 'PAIRED', peer }),
        onStart: (peerId): void => {
          // Garde par peer : ignorer un `start` d'un device non pairé (§B, isolation par room).
          if (peerId === pairedPeerId()) appOrchestrator.send({ type: 'PLAY' });
        },
        onInput: (payload, peerId): void => {
          // Seul l'input du peer pairé compte, et seul un device avec sim locale le consomme.
          if (applyAxes === undefined || peerId !== pairedPeerId()) return;
          if (payload.byteLength < INPUT_PAYLOAD_BYTES) return;
          decodeInput(new DataView(payload.buffer, payload.byteOffset), decodedInput);
          applyAxes(decodedInput.dirX, decodedInput.dirZ);
        },
        onHandoffRequest: (peerId): void => {
          if (peerId === pairedPeerId()) options.onHandoffRequest?.();
        },
        onHandoffState: (payload, peerId): void => {
          if (peerId !== pairedPeerId()) return;
          // Copie détachée : le buffer Trystero peut être une vue partagée, et le restore part
          // ensuite en transfert Comlink — il faut posséder l'ArrayBuffer exact.
          const copy = new ArrayBuffer(payload.byteLength);
          new Uint8Array(copy).set(payload);
          options.onHandoffState?.(copy);
        },
        onHandoffAck: (peerId): void => {
          if (peerId === pairedPeerId()) options.onHandoffAck?.();
        },
      },
    });
    actor.send({ type: 'CHANNEL_READY' });
  };

  // Effets réseau délégués par la machine (le COMMENT du join/leave/connect).
  const ports: ConnectionPorts = {
    createChannel: (): void => void openChannel(),
    leaveChannel: (): void => {
      if (channel !== null) {
        void channel.leave();
        channel = null;
      }
    },
    requestConnect: (peerId): void => channel?.requestConnect(peerId),
  };

  const actor = createActor(connectionMachine, { input: { ports } });

  // La machine est la source unique de la phase ; on pousse à l'UI (dédupé) et on déclenche les
  // effets applicatifs orthogonaux à la liveness (autorité/toasts) aux transitions de `paired`.
  let prevValue = 'idle';
  let lastKey = '';
  actor.subscribe((snap) => {
    const status = derivePhase(snap.value, snap.context);
    const key = `${status.phase}|${status.peerName ?? ''}|${status.errorReason ?? ''}`;
    if (key !== lastKey) {
      lastKey = key;
      onPhase(status);
    }
    const v = snap.value;
    if (v === 'paired' && prevValue !== 'paired') {
      appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
      options.showToast(
        effectiveRole === 'receiver'
          ? `CONNECTED TO CONTROLLER ${status.peerName ?? ''}`
          : `CONNECTED TO RECEIVER ${status.peerName ?? ''}`,
      );
      // La sheet (receiver) / le plein écran (controller) se retirent — le toast suffit.
      appOrchestrator.send({ type: 'CLOSE_PAIRING' });
    } else if (prevValue === 'paired' && v !== 'paired') {
      // §A.6 : sans ça le flock continuerait sur la dernière direction reçue.
      applyAxes?.(0, 0);
      options.onPairedPeerLost?.();
      appOrchestrator.send({ type: 'CONTROLLER_DISCONNECTED' });
    }
    prevValue = v;
  });
  actor.start();

  // Sink des joysticks DOM (main thread). Switch d'autorité §B.5 : quand ce device EST l'autorité,
  // les sticks écrivent dans le SAB local (un seul chemin à la fois) ; sinon ils partent au peer
  // pairé — no-op tant que le pairing n'a pas abouti.
  const sendInput = (dirX: number, dirZ: number): void => {
    if (isLocalAuthority?.() === true) {
      applyAxes?.(dirX, dirZ);
      return;
    }
    const pid = pairedPeerId();
    if (channel === null || pid === null) return;
    encodeInput(inputPayloadView, dirX, dirZ, inputSeq++);
    channel.sendInput(inputPayload, pid);
  };

  if (role === 'controller') {
    actor.send({ type: 'OPEN' });
  } else {
    let inPairing = false;
    appOrchestrator.subscribe((snapshot) => {
      const nowInPairing = snapshot.value === 'PAIRING_MODE';
      if (nowInPairing && !inPairing) actor.send({ type: 'OPEN' });
      // Sheet fermée : on quitte la room (no-op une fois pairé — `paired` ignore CLOSE, la
      // connexion persiste). Le QR reste valable, on re-joindra au prochain OPEN_PAIRING.
      if (!nowInPairing && inPairing) actor.send({ type: 'CLOSE' });
      inPairing = nowInPairing;
    });
  }

  return {
    notifyLocalPlay: (): void => channel?.sendStart(),
    retry: (): void => actor.send({ type: 'RETRY' }),
    joinAsController: (code: string): void => {
      // Bascule runtime : ce mobile (receiver au boot) devient controller et rejoint la room
      // scannée. On repart d'une passe propre (CLOSE puis OPEN) sur la nouvelle room.
      effectiveRole = 'controller';
      currentRoomCode = code;
      actor.send({ type: 'CLOSE' });
      actor.send({ type: 'OPEN' });
    },
    sendInput,
    sendHandoffRequest: (): void => {
      const pid = pairedPeerId();
      if (pid !== null) channel?.sendHandoffRequest(pid);
    },
    sendHandoffState: (buf: ArrayBuffer): void => {
      const pid = pairedPeerId();
      if (pid !== null) channel?.sendHandoffState(new Uint8Array(buf), pid);
    },
    sendHandoffAck: (): void => {
      const pid = pairedPeerId();
      if (pid !== null) channel?.sendHandoffAck(pid);
    },
  };
}
