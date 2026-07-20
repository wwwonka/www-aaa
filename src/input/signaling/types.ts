/** Rôle annoncé sur le canal de pairing — miroir de `DeviceRole` sans le cas `unknown`. */
export type PeerRole = 'controller' | 'receiver';

/**
 * Phase du cycle de pairing — **source unique de vérité** poussée par `pairingHost` via son
 * callback `onPhase`. L'UI (shell DOM) ne décide rien, elle rend la phase :
 * `searching` (QR / recherche) → `pairing` (peer découvert, connexion auto en cours, pastille) →
 * `paired` (connecté). `error` (timeout / busy / version — bouton RETRY) et `reconnecting`
 * (peer pairé perdu, on tente de recoller — câblé au PR 5) sont les états de robustesse.
 */
export type PairingPhase = 'searching' | 'pairing' | 'paired' | 'reconnecting' | 'error';

/**
 * Cause d'un échec de pairing (phase `error`) — pilote le message et l'affordance de reprise :
 * `timeout` (personne dans la room / handshake muet), `busy` (le receiver a déjà un controller),
 * `version` (build distant incompatible — cf. `PROTOCOL_VERSION`).
 */
export type PairingErrorReason = 'timeout' | 'busy' | 'version';

/** Snapshot de phase poussé vers l'UI — `peerName` non-nul dès `pairing`, `errorReason` en `error`. */
export interface PairingStatus {
  readonly phase: PairingPhase;
  readonly peerName: string | null;
  readonly errorReason?: PairingErrorReason;
}

/**
 * Version du protocole de pairing embarquée dans `presence`. Les actions ajoutées au fil du temps
 * (`busy`, plus tard `ping`) no-opent silencieusement face à un vieux build ; comparer la version
 * dès la présence rend le mismatch diagnosticable (toast « VERSION MISMATCH — RELOAD ») au lieu
 * d'un pairing qui échoue sans raison visible. À incrémenter à chaque changement de wire-format.
 */
export const PROTOCOL_VERSION = 1;

// Types alias (pas interfaces) : Trystero contraint ses payloads à `JsonValue`, et seuls les
// alias reçoivent une signature d'index implicite compatible en TypeScript.
export type PresencePayload = { role: PeerRole; name: string; v: number };
export type PairedPayload = { name: string };

/** Peer du rôle opposé annoncé via `presence` — ce que l'UI du receiver liste comme chip cliquable. */
export interface DiscoveredPeer {
  readonly id: string;
  readonly name: string;
}

export interface PairingChannelCallbacks {
  /** Un peer du rôle opposé s'est annoncé dans la room. */
  onPeerDiscovered(peer: DiscoveredPeer): void;
  /** Un peer a quitté la room — pairé ou non, au caller de décider. */
  onPeerLost(peerId: string): void;
  /**
   * Un peer demande la connexion (`connect` reçu). Le caller décide s'il accepte : le receiver
   * refuse un controller surnuméraire (déjà pairé) → le canal répond `busy` à ce peer précis.
   * Retour `true` = accepté (le canal confirme par `paired` et déclenche `onPaired`).
   */
  onPairRequest(peer: DiscoveredPeer): boolean;
  /** Notre `connect` a été refusé (le peer distant est déjà pairé) — remonter une erreur `busy`. */
  onBusy(): void;
  /** Un peer annonce une version de protocole incompatible (`presence.v`) — build distant à recharger. */
  onVersionMismatch(): void;
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
  /** Propage le lancement de partie au peer pairé — jamais un broadcast, `peerId` cible explicitement lui seul. */
  sendStart(peerId: string): void;
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
