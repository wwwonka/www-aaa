import { PROTOCOL_VERSION } from '../../../../src/input/signaling/types';
import type {
  DiscoveredPeer,
  PairingChannel,
  PairingChannelCallbacks,
  PairingChannelOptions,
  PeerRole,
} from '../../../../src/input/signaling/types';

// Fake EN MÉMOIRE de {@link PairingChannel} — aucune dépendance réseau (ni Trystero, ni nostr, ni
// WebRTC). Deux canaux joints à la même room via un {@link LoopbackHub} se découvrent et
// s'échangent messages exactement comme le vrai canal (voir `PairingChannel.ts`), en synchrone et
// déterministe. C'est l'outil qui rend testable la partie autrement invérifiable en sandbox : le
// pairing à deux devices. Réservé aux tests et au dev — jamais importé par le runtime prod.

interface Member {
  readonly id: string;
  readonly role: PeerRole;
  readonly name: string;
  readonly version: number;
  readonly cb: PairingChannelCallbacks;
}

/** Réseau fictif reliant des {@link createLoopbackChannel} par `roomId`. Une instance par test. */
export class LoopbackHub {
  private readonly _rooms = new Map<string, Map<string, Member>>();
  private _counter = 0;

  nextId(): string {
    return `loopback-${++this._counter}`;
  }

  join(roomId: string, member: Member): void {
    const room = this._rooms.get(roomId) ?? new Map<string, Member>();
    this._rooms.set(roomId, room);
    // Présence bilatérale à l'arrivée (comme `onPeerJoin` des DEUX côtés dans Trystero).
    for (const other of room.values()) {
      deliverPresence(member, other);
      deliverPresence(other, member);
    }
    room.set(member.id, member);
  }

  leave(roomId: string, id: string): void {
    const room = this._rooms.get(roomId);
    if (room === undefined || !room.delete(id)) return;
    for (const other of room.values()) other.cb.onPeerLost(id);
  }

  /** Achemine un `connect` : le destinataire décide (`onPairRequest`) → `paired` bilatéral ou `busy`. */
  connect(roomId: string, fromId: string, targetId: string): void {
    const room = this._rooms.get(roomId);
    const from = room?.get(fromId);
    const target = room?.get(targetId);
    if (from === undefined || target === undefined) return;
    const fromPeer: DiscoveredPeer = { id: from.id, name: from.name };
    if (target.cb.onPairRequest(fromPeer)) {
      target.cb.onPaired(fromPeer);
      from.cb.onPaired({ id: target.id, name: target.name });
    } else {
      from.cb.onBusy();
    }
  }
}

/** Un peer reçoit la présence d'un autre : version d'abord (mismatch → no-op discovery), rôle opposé ensuite. */
function deliverPresence(from: Member, to: Member): void {
  if (from.version !== to.version) {
    to.cb.onVersionMismatch();
    return;
  }
  if (from.role === to.role) return; // même rôle : ignoré (discovery filtrée par rôle opposé)
  to.cb.onPeerDiscovered({ id: from.id, name: from.name });
}

/**
 * Instancie un canal loopback dans `hub`. `versionOverride` simule un build distant incompatible
 * (test du mismatch de protocole). Les envois handoff/input/start sont acheminés au peer pairé
 * pour fidélité, même si les tests de la FSM de connexion ne les exercent pas.
 */
export function createLoopbackChannel(
  options: PairingChannelOptions,
  hub: LoopbackHub,
  versionOverride?: number,
): PairingChannel {
  const { role, roomId, deviceName, callbacks } = options;
  const id = hub.nextId();
  hub.join(roomId, {
    id,
    role,
    name: deviceName,
    version: versionOverride ?? PROTOCOL_VERSION,
    cb: callbacks,
  });

  return {
    requestConnect: (peerId) => hub.connect(roomId, id, peerId),
    sendStart: () => {},
    sendInput: () => {},
    sendHandoffRequest: () => {},
    sendHandoffState: () => {},
    sendHandoffAck: () => {},
    leave: () => {
      hub.leave(roomId, id);
      return Promise.resolve();
    },
  };
}
