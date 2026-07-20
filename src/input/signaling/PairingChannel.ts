// Stratégie `nostr` (et non `mqtt`) : ses relais sont nativement en wss/443, donc joignables
// derrière les firewalls qui bloquent les ports MQTT non-standard (8084/8884) — condition
// nécessaire au pairing cross-réseau (§Part B.0). L'API `joinRoom` est identique entre stratégies.
import { joinRoom } from '@trystero-p2p/nostr';
import { PROTOCOL_VERSION } from './types';
import type {
  DiscoveredPeer,
  PairedPayload,
  PairingChannel,
  PairingChannelOptions,
  PeerRole,
  PresencePayload,
} from './types';

// Namespace partagé par toutes les rooms de l'app sur les relais nostr publics — l'isolation
// entre sessions vient du roomId (code généré par le receiver), pas de l'appId.
const PAIRING_APP_ID = 'wwwaaa-console';

/**
 * Implémentation Trystero (nostr) de {@link PairingChannel} — main thread uniquement
 * (`RTCDataChannel` ne tourne pas en worker, voir docs/architecture/threading-model.md).
 *
 * Flow (porté du prototype webrtc-switch-system, scénario 1 seulement — pas de reconnexion) :
 * chaque peer annonce `presence {role, name}` à l'arrivée d'un pair ; la discovery est filtrée
 * par rôle opposé ; le receiver clique un peer → `connect` → le controller répond `paired {name}`
 * et les deux côtés déclenchent `onPaired`.
 */
export function createTrysteroPairingChannel(options: PairingChannelOptions): PairingChannel {
  const { role, roomId, deviceName, callbacks, iceServers } = options;
  const targetRole: PeerRole = role === 'receiver' ? 'controller' : 'receiver';
  const knownPeers = new Map<string, DiscoveredPeer>();

  // `rtcConfig.iceServers` = traversée NAT (§Part B). Sans, la connexion directe échoue hors LAN.
  // La liste (STUN public, ou STUN+TURN Cloudflare) est résolue par le caller — voir `iceServers.ts`.
  const room = joinRoom(
    iceServers !== undefined && iceServers.length > 0
      ? { appId: PAIRING_APP_ID, rtcConfig: { iceServers: [...iceServers] } }
      : { appId: PAIRING_APP_ID },
    roomId,
  );

  const presence = room.makeAction<PresencePayload>('presence');
  const connect = room.makeAction<null>('connect');
  const paired = room.makeAction<PairedPayload>('paired');
  // `busy` : refus ciblé d'un `connect` quand on est déjà pairé (controller surnuméraire).
  const busy = room.makeAction<null>('busy');
  const start = room.makeAction<null>('start');
  const input = room.makeAction<Uint8Array>('input');
  // Handoff §B.2 : hoReq (demande d'autorité), hoState (snapshot §B.3), hoAck (autorité cédée).
  const hoReq = room.makeAction<null>('hoReq');
  const hoState = room.makeAction<Uint8Array>('hoState');
  const hoAck = room.makeAction<null>('hoAck');

  // Presence ciblée à chaque arrivée plutôt qu'un broadcast périodique : `onPeerJoin` se
  // déclenche des deux côtés pour chaque nouvelle paire, ça suffit à l'échange mutuel.
  room.onPeerJoin = (peerId): void => {
    void presence.send({ role, name: deviceName, v: PROTOCOL_VERSION }, { target: peerId });
  };

  room.onPeerLeave = (peerId): void => {
    if (knownPeers.delete(peerId)) callbacks.onPeerLost(peerId);
  };

  presence.onMessage = (data, { peerId }): void => {
    // Version d'abord : un build distant incompatible (`busy`/`ping` no-opés) est indiagnosticable
    // sinon. Le mismatch coupe la découverte — le caller affiche « VERSION MISMATCH — RELOAD ».
    if (data.v !== PROTOCOL_VERSION) {
      callbacks.onVersionMismatch();
      return;
    }
    if (data.role !== targetRole || knownPeers.has(peerId)) return;
    const peer: DiscoveredPeer = { id: peerId, name: data.name };
    knownPeers.set(peerId, peer);
    callbacks.onPeerDiscovered(peer);
  };

  // Reçu quand le peer opposé initie la connexion (clic de chip côté receiver, OU auto-pairing
  // initié par un controller qui a scanné notre QR). Le caller décide via `onPairRequest` : un
  // receiver déjà pairé refuse → `busy` ciblé (le controller surnuméraire verra une erreur). Sinon
  // handshake symétrique : on confirme par `paired` et on se marque pairé. Fallback nom si la
  // présence n'est pas encore arrivée (l'auto-pairing peut devancer l'échange de présence).
  connect.onMessage = (_data, { peerId }): void => {
    const peer = knownPeers.get(peerId) ?? { id: peerId, name: 'PLAYER' };
    if (!callbacks.onPairRequest(peer)) {
      void busy.send(null, { target: peerId });
      return;
    }
    void paired.send({ name: deviceName }, { target: peerId });
    callbacks.onPaired(peer);
  };

  // Reçu côté receiver : confirmation du controller sélectionné.
  paired.onMessage = (data, { peerId }): void => {
    callbacks.onPaired({ id: peerId, name: data.name });
  };

  // Reçu côté initiateur : notre `connect` a été refusé (le peer distant est déjà pairé).
  busy.onMessage = (_data, { peerId }): void => {
    if (knownPeers.has(peerId)) callbacks.onBusy();
  };

  start.onMessage = (_data, { peerId }): void => {
    callbacks.onStart(peerId);
  };

  input.onMessage = (data, { peerId }): void => {
    callbacks.onInput(data, peerId);
  };

  hoReq.onMessage = (_data, { peerId }): void => {
    callbacks.onHandoffRequest(peerId);
  };

  hoState.onMessage = (data, { peerId }): void => {
    callbacks.onHandoffState(data, peerId);
  };

  hoAck.onMessage = (_data, { peerId }): void => {
    callbacks.onHandoffAck(peerId);
  };

  return {
    requestConnect(peerId: string): void {
      void connect.send(null, { target: peerId });
    },
    sendStart(peerId: string): void {
      void start.send(null, { target: peerId });
    },
    sendInput(payload: Uint8Array, peerId: string): void {
      void input.send(payload, { target: peerId });
    },
    sendHandoffRequest(peerId: string): void {
      void hoReq.send(null, { target: peerId });
    },
    sendHandoffState(payload: Uint8Array, peerId: string): void {
      void hoState.send(payload, { target: peerId });
    },
    sendHandoffAck(peerId: string): void {
      void hoAck.send(null, { target: peerId });
    },
    leave: (): Promise<void> => room.leave(),
  };
}
