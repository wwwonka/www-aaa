import { joinRoom } from '@trystero-p2p/mqtt';
import type {
  DiscoveredPeer,
  PairedPayload,
  PairingChannel,
  PairingChannelOptions,
  PeerRole,
  PresencePayload,
} from './types';

// Namespace partagé par toutes les rooms de l'app sur les relays MQTT publics — l'isolation
// entre sessions vient du roomId (code généré par le receiver), pas de l'appId.
const PAIRING_APP_ID = 'wwwaaa-console';

/**
 * Implémentation Trystero (MQTT) de {@link PairingChannel} — main thread uniquement
 * (`RTCDataChannel` ne tourne pas en worker, voir docs/threading-model.md).
 *
 * Flow (porté du prototype webrtc-switch-system, scénario 1 seulement — pas de reconnexion) :
 * chaque peer annonce `presence {role, name}` à l'arrivée d'un pair ; la discovery est filtrée
 * par rôle opposé ; le receiver clique un peer → `connect` → le controller répond `paired {name}`
 * et les deux côtés déclenchent `onPaired`.
 */
export function createTrysteroPairingChannel(options: PairingChannelOptions): PairingChannel {
  const { role, roomId, deviceName, callbacks } = options;
  const targetRole: PeerRole = role === 'receiver' ? 'controller' : 'receiver';
  const knownPeers = new Map<string, DiscoveredPeer>();

  const room = joinRoom({ appId: PAIRING_APP_ID }, roomId);

  const presence = room.makeAction<PresencePayload>('presence');
  const connect = room.makeAction<null>('connect');
  const paired = room.makeAction<PairedPayload>('paired');
  const start = room.makeAction<null>('start');

  // Presence ciblée à chaque arrivée plutôt qu'un broadcast périodique : `onPeerJoin` se
  // déclenche des deux côtés pour chaque nouvelle paire, ça suffit à l'échange mutuel.
  room.onPeerJoin = (peerId): void => {
    void presence.send({ role, name: deviceName }, { target: peerId });
  };

  room.onPeerLeave = (peerId): void => {
    if (knownPeers.delete(peerId)) callbacks.onPeerLost(peerId);
  };

  presence.onMessage = (data, { peerId }): void => {
    if (data.role !== targetRole || knownPeers.has(peerId)) return;
    const peer: DiscoveredPeer = { id: peerId, name: data.name };
    knownPeers.set(peerId, peer);
    callbacks.onPeerDiscovered(peer);
  };

  // Reçu côté controller : le receiver a cliqué sur notre chip — on confirme, on est pairé.
  connect.onMessage = (_data, { peerId }): void => {
    void paired.send({ name: deviceName }, { target: peerId });
    const peer = knownPeers.get(peerId);
    if (peer) callbacks.onPaired(peer);
  };

  // Reçu côté receiver : confirmation du controller sélectionné.
  paired.onMessage = (data, { peerId }): void => {
    callbacks.onPaired({ id: peerId, name: data.name });
  };

  start.onMessage = (): void => {
    callbacks.onStart();
  };

  return {
    requestConnect(peerId: string): void {
      void connect.send(null, { target: peerId });
    },
    sendStart(): void {
      void start.send(null);
    },
    leave: (): Promise<void> => room.leave(),
  };
}
