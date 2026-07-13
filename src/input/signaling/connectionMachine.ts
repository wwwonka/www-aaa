import { setup, assign } from 'xstate';
import type { DiscoveredPeer, PairingErrorReason, PairingStatus } from './types';

// FSM de LIVENESS du pairing (main thread — contrainte WebRTC) — sœur de `HandoffCoordinator`,
// même rôle : concentrer une logique à timers dans une machine explicite plutôt que d'éparpiller
// des `setTimeout` dans `pairingHost`. xstate `after` nettoie chaque timer à la sortie d'état :
// zéro timer fantôme, une reprise (RETRY / rejoin) impossible à laisser fuir.
//
// PÉRIMÈTRE STRICT — cette machine ne connaît QUE l'état de la connexion (qui est là, handshake,
// erreurs, reprise). Elle IGNORE l'autorité du game state : ça reste `HandoffCoordinator`
// (CLAUDE.md §4, autorité unique). Ne jamais y ajouter d'ACTIVE/PASSIVE — ce serait une seconde
// autorité. Les effets réseau (join/leave/connect) sont délégués via `ports` (voir `pairingHost`) ;
// injecter un `loopbackChannel` en test rend la partie la moins vérifiable (pairing 2-devices)
// la mieux couverte, sans réseau.

export const DISCOVERY_TIMEOUT_MS = 30_000;
export const HANDSHAKE_TIMEOUT_MS = 10_000;
export const RETRY_INTERVAL_MS = 30_000;
/** Tentatives de handshake avant d'abandonner en `error/timeout` (≈ 3 × 10 s couvre la découverte). */
export const MAX_HANDSHAKE_ATTEMPTS = 3;

/**
 * Effets réseau que la machine délègue à son intégrateur (`pairingHost`, ou un `loopbackChannel`
 * en test). La machine reste pure : elle décide QUAND joindre/quitter/connecter, `ports` fait le COMMENT.
 */
export interface ConnectionPorts {
  /** Joindre la room courante (crée le canal Trystero — idempotent si déjà joint). */
  createChannel(): void;
  /** Quitter la room courante (détruit le canal). */
  leaveChannel(): void;
  /** Initier le handshake vers un peer découvert (envoie `connect`). */
  requestConnect(peerId: string): void;
}

export interface ConnectionContext {
  readonly ports: ConnectionPorts;
  /** Peer du rôle opposé courant (découvert ou pairé) — `null` en recherche pure. */
  peer: DiscoveredPeer | null;
  errorReason: PairingErrorReason | null;
  /** Handshakes tentés dans la passe courante (borne `MAX_HANDSHAKE_ATTEMPTS`). */
  handshakeAttempts: number;
}

export type ConnectionEvent =
  | { type: 'OPEN' } // l'UI de pairing s'ouvre (ou boot controller) → joindre
  | { type: 'CHANNEL_READY' } // le canal est joint, on peut chercher
  | { type: 'PEER_APPEARED'; peer: DiscoveredPeer } // peer opposé vu (côté passif : chip, on attend son `connect`)
  | { type: 'INITIATE_PAIR'; peer: DiscoveredPeer } // côté actif (controller auto / tap) : on connecte
  | { type: 'PAIRED'; peer: DiscoveredPeer } // handshake abouti
  | { type: 'PEER_LOST' } // le peer courant a quitté la room
  | { type: 'BUSY' } // notre `connect` refusé (peer déjà pairé)
  | { type: 'VERSION_MISMATCH' } // build distant incompatible
  | { type: 'RETRY' } // bouton RETRY : rejoin immédiat
  | { type: 'CLOSE' }; // l'UI se ferme sans pairing → quitter

/** Valeur d'état de la machine (miroir des clés de `states`). */
export type ConnectionStateValue =
  | 'idle'
  | 'joining'
  | 'searching'
  | 'handshaking'
  | 'paired'
  | 'reconnecting'
  | 'error';

export const connectionMachine = setup({
  types: {
    context: {} as ConnectionContext,
    events: {} as ConnectionEvent,
    input: {} as { ports: ConnectionPorts },
  },
  delays: {
    DISCOVERY: DISCOVERY_TIMEOUT_MS,
    HANDSHAKE: HANDSHAKE_TIMEOUT_MS,
    RETRY: RETRY_INTERVAL_MS,
  },
  guards: {
    // +1 car on décide AVANT d'incrémenter : autorise la ré-entrée tant qu'on n'a pas atteint le plafond.
    canRetryHandshake: ({ context }) => context.handshakeAttempts + 1 < MAX_HANDSHAKE_ATTEMPTS,
  },
  actions: {
    createChannel: ({ context }) => context.ports.createChannel(),
    leaveChannel: ({ context }) => context.ports.leaveChannel(),
    requestConnectToPeer: ({ context }) => {
      if (context.peer !== null) context.ports.requestConnect(context.peer.id);
    },
    setPeer: assign({
      peer: ({ event }) =>
        event.type === 'PEER_APPEARED' || event.type === 'INITIATE_PAIR' || event.type === 'PAIRED'
          ? event.peer
          : null,
    }),
    clearPeer: assign({ peer: null }),
    resetPass: assign({ peer: null, errorReason: null, handshakeAttempts: 0 }),
    clearError: assign({ errorReason: null }),
    resetAttempts: assign({ handshakeAttempts: 0 }),
    incAttempts: assign({ handshakeAttempts: ({ context }) => context.handshakeAttempts + 1 }),
    failTimeout: assign({ errorReason: (): PairingErrorReason => 'timeout' }),
    failBusy: assign({ errorReason: (): PairingErrorReason => 'busy' }),
    failVersion: assign({ errorReason: (): PairingErrorReason => 'version' }),
  },
}).createMachine({
  id: 'connection',
  initial: 'idle',
  context: ({ input }) => ({
    ports: input.ports,
    peer: null,
    errorReason: null,
    handshakeAttempts: 0,
  }),
  states: {
    // Pas dans une room : avant OPEN, ou après CLOSE. On repart d'une passe propre.
    idle: {
      entry: 'resetPass',
      on: { OPEN: 'joining' },
    },

    // Canal en cours de création (import dynamique + fetch ICE + joinRoom, côté `pairingHost`).
    joining: {
      entry: 'createChannel',
      on: {
        CHANNEL_READY: 'searching',
        VERSION_MISMATCH: { target: 'error', actions: 'failVersion' },
        CLOSE: { target: 'idle', actions: 'leaveChannel' },
      },
    },

    // Dans la room, personne de compatible encore connecté. `after DISCOVERY` = garde-fou contre
    // une room morte (relais nostr silencieux, QR périmé) → `error/timeout` (l'UI propose RETRY).
    searching: {
      entry: 'clearError',
      after: { DISCOVERY: { target: 'error', actions: 'failTimeout' } },
      on: {
        INITIATE_PAIR: { target: 'handshaking', actions: 'setPeer' },
        PEER_APPEARED: { actions: 'setPeer' }, // interne : chip visible, le timer de découverte court toujours
        PAIRED: { target: 'paired', actions: 'setPeer' }, // côté passif : on a répondu à un `connect`
        PEER_LOST: { actions: 'clearPeer' },
        BUSY: { target: 'error', actions: 'failBusy' },
        VERSION_MISMATCH: { target: 'error', actions: 'failVersion' },
        CLOSE: { target: 'idle', actions: 'leaveChannel' },
      },
    },

    // Côté actif : `connect` envoyé, on attend `paired`. Muet pendant HANDSHAKE → on ré-essaie
    // (peer toujours là mais SDP perdu), puis on abandonne en `error/timeout` après MAX tentatives.
    handshaking: {
      entry: 'requestConnectToPeer',
      after: {
        HANDSHAKE: [
          { guard: 'canRetryHandshake', target: 'handshaking', reenter: true, actions: 'incAttempts' },
          { target: 'error', actions: 'failTimeout' },
        ],
      },
      on: {
        PAIRED: { target: 'paired', actions: 'setPeer' },
        PEER_LOST: { target: 'searching', actions: 'clearPeer' },
        BUSY: { target: 'error', actions: 'failBusy' },
        VERSION_MISMATCH: { target: 'error', actions: 'failVersion' },
        CLOSE: { target: 'idle', actions: 'leaveChannel' },
      },
    },

    // Connecté. L'UI de pairing se referme (le toast suffit) mais la connexion PERSISTE : pas de
    // CLOSE ici. Un départ du peer pairé → `searching` (PR 4) ; le PR 5 en fera `reconnecting`.
    paired: {
      entry: 'resetAttempts',
      on: {
        PEER_LOST: { target: 'searching', actions: 'clearPeer' },
      },
    },

    // Réservé PR 5 (peer pairé perdu → on reste dans la room et on tente de recoller). Non atteint
    // en PR 4 ; présent pour que l'UI et le type de phase soient déjà prêts (zéro câblage lifecycle ici).
    reconnecting: {
      on: {
        PAIRED: { target: 'paired', actions: 'setPeer' },
        PEER_LOST: { actions: 'clearPeer' },
        CLOSE: { target: 'idle', actions: 'leaveChannel' },
      },
    },

    // Échec visible (RETRY dans l'UI). Auto-rejoin toutes les RETRY ms tant que l'UI est ouverte
    // (CLOSE nous sort en idle) : couvre l'échec nostr silencieux sans laisser un spinner éternel.
    error: {
      after: { RETRY: { target: 'joining', actions: 'leaveChannel' } },
      on: {
        RETRY: { target: 'joining', actions: 'leaveChannel' },
        CLOSE: { target: 'idle', actions: 'leaveChannel' },
      },
    },
  },
});

/**
 * Dérive la {@link PairingStatus} poussée à l'UI depuis un snapshot de la machine — source unique,
 * l'UI ne fait que rendre. `pairing` couvre « peer vu, pas encore pairé » (searching+chip ET handshaking).
 */
export function derivePhase(
  value: ConnectionStateValue,
  context: Pick<ConnectionContext, 'peer' | 'errorReason'>,
): PairingStatus {
  const peerName = context.peer?.name ?? null;
  switch (value) {
    case 'paired':
      return { phase: 'paired', peerName };
    case 'reconnecting':
      return { phase: 'reconnecting', peerName };
    case 'error':
      return { phase: 'error', peerName: null, errorReason: context.errorReason ?? 'timeout' };
    case 'handshaking':
      return { phase: 'pairing', peerName };
    case 'searching':
      return peerName !== null
        ? { phase: 'pairing', peerName }
        : { phase: 'searching', peerName: null };
    default: // idle | joining
      return { phase: 'searching', peerName: null };
  }
}
