/** Rôle annoncé sur le canal de pairing — miroir de `DeviceRole` sans le cas `unknown`. */
export type PeerRole = 'controller' | 'receiver';

// Types alias (pas interfaces) : Trystero contraint ses payloads à `JsonValue`, et seuls les
// alias reçoivent une signature d'index implicite compatible en TypeScript.
export type PresencePayload = { role: PeerRole; name: string };
export type PairedPayload = { name: string };

/** Peer du rôle opposé annoncé via `presence` — ce que l'UI du receiver liste comme chip cliquable. */
export interface DiscoveredPeer {
  readonly id: string;
  readonly name: string;
}

export interface PairingChannelCallbacks {
  /** Un peer du rôle opposé s'est annoncé dans la room. */
  onPeerDiscovered(peer: DiscoveredPeer): void;
  /** Un peer a quitté la room — pairé ou non, au caller de décider (pas de reconnexion, hors scope). */
  onPeerLost(peerId: string): void;
  /** Handshake `connect` → `paired` abouti — les deux côtés le reçoivent. */
  onPaired(peer: DiscoveredPeer): void;
  /** Le peer distant a lancé la partie (action `start`). */
  onStart(peerId: string): void;
  /** Input analogique distant encodé en binaire (int16/int16/seq). */
  onInput(payload: Uint8Array, peerId: string): void;
  /** Le peer demande l'autorité (`hoReq`) — répondre par `hoState` si on est ACTIVE. */
  onHandoffRequest(peerId: string): void;
  /** Snapshot complet reçu (`hoState`, layout §B.3) — restaurer puis ACK. */
  onHandoffState(payload: Uint8Array, peerId: string): void;
  /** ACK (`hoAck`, couvre `confirmed` ET `returned` du brief) — l'autorité est cédée. */
  onHandoffAck(peerId: string): void;
}

export interface PairingChannelOptions {
  readonly role: PeerRole;
  /** Code de session généré par le receiver (embarqué dans le QR via `?r=`). */
  readonly roomId: string;
  readonly deviceName: string;
  readonly callbacks: PairingChannelCallbacks;
  /**
   * Serveurs STUN/TURN pour la traversée NAT (voir `iceServers.ts`). Omis = pas de `rtcConfig`
   * (connexion directe seulement, même-LAN). Résolu par le caller avant `join` (creds éphémères).
   */
  readonly iceServers?: readonly RTCIceServer[];
}

/**
 * Canal de pairing abstrait — l'implémentation Trystero est un détail (voir `PairingChannel.ts`) ;
 * garder cette interface permet de swapper le transport (worker-signaling, RTC-in-worker futur)
 * sans toucher au câblage main-thread.
 */
export interface PairingChannel {
  /** Receiver uniquement : demande la connexion au peer cliqué — il répondra par `paired`. */
  requestConnect(peerId: string): void;
  /** Propage le lancement de partie au peer pairé. */
  sendStart(): void;
  /** Envoie un payload input binaire au peer pairé. */
  sendInput(payload: Uint8Array, peerId: string): void;
  /** Demande l'autorité au peer pairé (protocole de handoff §B.2). */
  sendHandoffRequest(peerId: string): void;
  /** Envoie le snapshot complet (§B.3) au demandeur. */
  sendHandoffState(payload: Uint8Array, peerId: string): void;
  /** Confirme la prise d'autorité à l'ex-autorité. */
  sendHandoffAck(peerId: string): void;
  leave(): Promise<void>;
}
