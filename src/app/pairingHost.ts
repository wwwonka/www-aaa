import * as Comlink from 'comlink';
import type { RenderWorkerApi } from '../render/render.worker';
import { appOrchestrator } from '../core/AppOrchestrator';
import { createTrysteroPairingChannel } from '../input/signaling/PairingChannel';
import type { DiscoveredPeer, PairingChannel, PeerRole } from '../input/signaling/types';

export interface PairingHostOptions {
  readonly role: PeerRole;
  /** Code de session — généré côté receiver, lu depuis `?r=` côté controller (`null` = pas de room, on reste en searching). */
  readonly roomCode: string | null;
  readonly deviceName: string;
  readonly renderApi: RenderWorkerApi;
}

export interface PairingHost {
  /** À appeler quand le device local lance la partie — propage `start` au peer pairé. */
  notifyLocalPlay(): void;
}

/**
 * Câble le canal de pairing (main thread, contrainte WebRTC) à l'orchestrateur et au render
 * worker. Controller : join dès le boot (il démarre sur le pairing plein écran). Receiver :
 * join lazy à l'ouverture de `PAIRING_MODE`, leave si la sheet se ferme sans pairing.
 * Scénario 1 uniquement — un départ de peer redevient searching, aucune reconnexion.
 */
export function setupPairingHost(options: PairingHostOptions): PairingHost {
  const { role, roomCode, deviceName, renderApi } = options;

  let channel: PairingChannel | null = null;
  let pairedPeerId: string | null = null;
  const discovered = new Map<string, DiscoveredPeer>();

  const pushDiscovered = (): void => {
    // Seul le receiver liste les peers (chips cliquables) — le controller attend le `connect`.
    if (role === 'receiver') void renderApi.setDiscoveredPeers([...discovered.values()]);
  };

  const join = (): void => {
    if (channel !== null || roomCode === null) return;
    channel = createTrysteroPairingChannel({
      role,
      roomId: roomCode,
      deviceName,
      callbacks: {
        onPeerDiscovered(peer): void {
          discovered.set(peer.id, peer);
          pushDiscovered();
        },
        onPeerLost(peerId): void {
          discovered.delete(peerId);
          pushDiscovered();
          if (peerId !== pairedPeerId) return;
          pairedPeerId = null;
          appOrchestrator.send({ type: 'CONTROLLER_DISCONNECTED' });
          void renderApi.setControllerPaired(null);
        },
        onPaired(peer): void {
          pairedPeerId = peer.id;
          discovered.clear();
          pushDiscovered();
          appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
          void renderApi.setControllerPaired(peer.name);
          void renderApi.showToast(
            role === 'receiver'
              ? `CONNECTED TO CONTROLLER ${peer.name}`
              : `CONNECTED TO RECEIVER ${peer.name}`,
          );
          // La sheet (receiver) / le plein écran (controller) se retirent — le toast suffit.
          appOrchestrator.send({ type: 'CLOSE_PAIRING' });
        },
        onStart(): void {
          appOrchestrator.send({ type: 'PLAY' });
        },
      },
    });
  };

  void renderApi.setPairingActions(
    Comlink.proxy({
      connectPeer: (peerId: string): void => channel?.requestConnect(peerId),
    }),
  );

  if (role === 'controller') {
    join();
  } else {
    let inPairing = false;
    appOrchestrator.subscribe((snapshot) => {
      const nowInPairing = snapshot.value === 'PAIRING_MODE';
      if (nowInPairing && !inPairing) join();
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
  };
}
