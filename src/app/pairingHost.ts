import { appOrchestrator } from '../core/AppOrchestrator';
import { getIceServers } from '../input/signaling/iceServers';
import type {
  DiscoveredPeer,
  PairingChannel,
  PairingStatus,
  PeerRole,
} from '../input/signaling/types';
import { decodeInput, encodeInput } from '../input/inputCodec';
import type { DecodedInput } from '../input/inputCodec';
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
 * Câble le canal de pairing (main thread, contrainte WebRTC) à l'orchestrateur et au shell
 * DOM. Controller : join dès le boot (il démarre sur le pairing plein écran). Receiver :
 * join lazy à l'ouverture de `PAIRING_MODE`, leave si la sheet se ferme sans pairing.
 * Scénario 1 uniquement — un départ de peer redevient searching, aucune reconnexion.
 */
export function setupPairingHost(options: PairingHostOptions): PairingHost {
  const { role, roomCode, deviceName, onPhase, applyAxes, isLocalAuthority } = options;

  // Rôle EFFECTIF du canal : `role` au boot, mais un mobile solo (receiver) peut basculer en
  // controller au runtime via `joinAsController` (« USE DEVICE AS CONTROLLER »).
  let effectiveRole: PeerRole = role;

  let channel: PairingChannel | null = null;
  let pairedPeerId: string | null = null;
  const discovered = new Map<string, DiscoveredPeer>();

  // Transport input ~30 Hz (§A.3/A.6) : tampons réutilisés, zéro allocation par envoi.
  const inputPayload = new Uint8Array(INPUT_PAYLOAD_BYTES);
  const inputPayloadView = new DataView(inputPayload.buffer);
  const decodedInput: DecodedInput = { dirX: 0, dirZ: 0, seq: 0 };
  let inputSeq = 0;

  // Source unique de la phase visuelle : searching (aucun peer) ⇄ pairing (peer opposé découvert,
  // connexion auto en cours). `paired` est poussé séparément par onPaired.
  const pushPhase = (): void => {
    if (pairedPeerId !== null) return;
    const peer = [...discovered.values()][0];
    onPhase({ phase: peer ? 'pairing' : 'searching', peerName: peer?.name ?? null });
  };

  let joining = false;
  const join = async (overrideCode?: string): Promise<void> => {
    const rid = overrideCode ?? roomCode;
    if (channel !== null || joining || rid === null) return;
    joining = true;
    // Résout STUN/TURN (creds éphémères Cloudflare, fallback STUN public) AVANT de joindre la room,
    // pour que la négociation ICE dispose des relais dès le départ (voir `iceServers.ts`).
    // PairingChannel (trystero+nostr) en import() dynamique (D5) : le receiver ne le charge
    // qu'à OPEN_PAIRING ; le controller joint au boot, l'import part en parallèle du fetch ICE.
    const [{ createTrysteroPairingChannel }, iceServers] = await Promise.all([
      import('../input/signaling/PairingChannel'),
      getIceServers(),
    ]);
    joining = false;
    if (channel !== null) return; // re-check après l'await (leave concurrent)
    channel = createTrysteroPairingChannel({
      role: effectiveRole,
      roomId: rid,
      deviceName,
      iceServers,
      callbacks: {
        onPeerDiscovered(peer): void {
          discovered.set(peer.id, peer);
          pushPhase(); // QR fade out + pastille du peer (les 2 côtés)
          // Auto-pairing : le controller a scanné le QR du receiver — le scan EST la confirmation,
          // on connecte automatiquement dès qu'on découvre le receiver (pas de tap requis). Le
          // handshake `connect`→`paired` est symétrique. Le tap-sur-pastille reste dispo pour le
          // futur cas sans scan (reconnexion, code tapé, gamepad).
          if (effectiveRole === 'controller' && pairedPeerId === null) {
            channel?.requestConnect(peer.id);
          }
        },
        onPeerLost(peerId): void {
          discovered.delete(peerId);
          if (peerId !== pairedPeerId) {
            pushPhase(); // le peer découvert (pas encore pairé) est parti → retour searching
            return;
          }
          pairedPeerId = null;
          // §A.6 : sans ça le flock continuerait sur la dernière direction reçue.
          applyAxes?.(0, 0);
          options.onPairedPeerLost?.();
          appOrchestrator.send({ type: 'CONTROLLER_DISCONNECTED' });
          onPhase({ phase: 'searching', peerName: null });
        },
        onPaired(peer): void {
          if (pairedPeerId !== null) return; // déjà pairé — évite un double toast (auto + clic concurrents)
          pairedPeerId = peer.id;
          discovered.clear();
          appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
          onPhase({ phase: 'paired', peerName: peer.name });
          options.showToast(
            effectiveRole === 'receiver'
              ? `CONNECTED TO CONTROLLER ${peer.name}`
              : `CONNECTED TO RECEIVER ${peer.name}`,
          );
          // La sheet (receiver) / le plein écran (controller) se retirent — le toast suffit.
          appOrchestrator.send({ type: 'CLOSE_PAIRING' });
        },
        onStart(): void {
          appOrchestrator.send({ type: 'PLAY' });
        },
        onInput(payload, peerId): void {
          // Seul l'input du peer pairé compte, et seul un device avec sim locale le consomme.
          if (applyAxes === undefined || peerId !== pairedPeerId) return;
          if (payload.byteLength < INPUT_PAYLOAD_BYTES) return;
          decodeInput(new DataView(payload.buffer, payload.byteOffset), decodedInput);
          applyAxes(decodedInput.dirX, decodedInput.dirZ);
        },
        onHandoffRequest(peerId): void {
          if (peerId === pairedPeerId) options.onHandoffRequest?.();
        },
        onHandoffState(payload, peerId): void {
          if (peerId !== pairedPeerId) return;
          // Copie détachée : le buffer Trystero peut être une vue partagée, et le restore part
          // ensuite en transfert Comlink — il faut posséder l'ArrayBuffer exact.
          const copy = new ArrayBuffer(payload.byteLength);
          new Uint8Array(copy).set(payload);
          options.onHandoffState?.(copy);
        },
        onHandoffAck(peerId): void {
          if (peerId === pairedPeerId) options.onHandoffAck?.();
        },
      },
    });
  };

  // Sink des joysticks DOM (main thread). Switch d'autorité §B.5 : quand ce device EST l'autorité,
  // les sticks écrivent dans le SAB local (un seul chemin à la fois) ; sinon ils partent au peer
  // pairé — no-op tant que le pairing n'a pas abouti.
  const sendInput = (dirX: number, dirZ: number): void => {
    if (isLocalAuthority?.() === true) {
      applyAxes?.(dirX, dirZ);
      return;
    }
    if (channel === null || pairedPeerId === null) return;
    encodeInput(inputPayloadView, dirX, dirZ, inputSeq++);
    channel.sendInput(inputPayload, pairedPeerId);
  };

  if (role === 'controller') {
    void join();
  } else {
    let inPairing = false;
    appOrchestrator.subscribe((snapshot) => {
      const nowInPairing = snapshot.value === 'PAIRING_MODE';
      if (nowInPairing && !inPairing) void join();
      // Sheet fermée sans pairing : on quitte la room (le QR reste valable, on re-joindra au
      // prochain OPEN_PAIRING avec le même code de session).
      if (!nowInPairing && inPairing && pairedPeerId === null && channel !== null) {
        void channel.leave();
        channel = null;
      }
      inPairing = nowInPairing;
    });
  }

  return {
    notifyLocalPlay: (): void => channel?.sendStart(),
    joinAsController: (code: string): void => {
      // Bascule runtime : ce mobile (receiver au boot) devient controller et rejoint la room
      // scannée. Le receiver distant le découvrira comme chip et confirmera (§Part B).
      effectiveRole = 'controller';
      void join(code);
    },
    sendInput,
    sendHandoffRequest: (): void => {
      if (pairedPeerId !== null) channel?.sendHandoffRequest(pairedPeerId);
    },
    sendHandoffState: (buf: ArrayBuffer): void => {
      if (pairedPeerId !== null) channel?.sendHandoffState(new Uint8Array(buf), pairedPeerId);
    },
    sendHandoffAck: (): void => {
      if (pairedPeerId !== null) channel?.sendHandoffAck(pairedPeerId);
    },
  };
}
