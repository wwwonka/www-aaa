import { describe, expect, it, vi } from 'vitest';
import { createLoopbackChannel, LoopbackHub } from './loopbackChannel';
import { PROTOCOL_VERSION } from './types';
import type { DiscoveredPeer, PairingChannelCallbacks, PeerRole } from './types';

const ROOM = 'ABCDE';

/** Callbacks mockés, `onPairRequest` piloté par test (défaut : accepte). */
function makeCallbacks(onPairRequest: () => boolean = () => true): PairingChannelCallbacks {
  return {
    onPeerDiscovered: vi.fn(),
    onPeerLost: vi.fn(),
    onPairRequest: vi.fn(onPairRequest),
    onBusy: vi.fn(),
    onVersionMismatch: vi.fn(),
    onPaired: vi.fn(),
    onStart: vi.fn(),
    onInput: vi.fn(),
    onHandoffRequest: vi.fn(),
    onHandoffState: vi.fn(),
    onHandoffAck: vi.fn(),
  };
}

function join(hub: LoopbackHub, role: PeerRole, cb: PairingChannelCallbacks, version?: number) {
  return createLoopbackChannel(
    { role, roomId: ROOM, deviceName: role === 'receiver' ? 'RECV' : 'CTRL', callbacks: cb },
    hub,
    version,
  );
}

/** Extrait l'id du peer découvert (généré par le hub) depuis le premier appel `onPeerDiscovered`. */
function discoveredId(cb: PairingChannelCallbacks): string {
  const call = (cb.onPeerDiscovered as ReturnType<typeof vi.fn>).mock.calls[0];
  return (call[0] as DiscoveredPeer).id;
}

describe('loopbackChannel', () => {
  it('deux rôles opposés se découvrent à la jonction', () => {
    const hub = new LoopbackHub();
    const recv = makeCallbacks();
    const ctrl = makeCallbacks();
    join(hub, 'receiver', recv);
    join(hub, 'controller', ctrl);

    expect(recv.onPeerDiscovered).toHaveBeenCalledWith(expect.objectContaining({ name: 'CTRL' }));
    expect(ctrl.onPeerDiscovered).toHaveBeenCalledWith(expect.objectContaining({ name: 'RECV' }));
  });

  it('même rôle : pas de découverte (filtrage par rôle opposé)', () => {
    const hub = new LoopbackHub();
    const a = makeCallbacks();
    const b = makeCallbacks();
    join(hub, 'receiver', a);
    join(hub, 'receiver', b);
    expect(a.onPeerDiscovered).not.toHaveBeenCalled();
    expect(b.onPeerDiscovered).not.toHaveBeenCalled();
  });

  it('connect accepté → paired des deux côtés', () => {
    const hub = new LoopbackHub();
    const recv = makeCallbacks();
    const ctrl = makeCallbacks();
    join(hub, 'receiver', recv);
    const ctrlChannel = join(hub, 'controller', ctrl);

    ctrlChannel.requestConnect(discoveredId(ctrl));

    expect(recv.onPairRequest).toHaveBeenCalledOnce();
    expect(recv.onPaired).toHaveBeenCalledWith(expect.objectContaining({ name: 'CTRL' }));
    expect(ctrl.onPaired).toHaveBeenCalledWith(expect.objectContaining({ name: 'RECV' }));
    expect(ctrl.onBusy).not.toHaveBeenCalled();
  });

  it('receiver plein : connect refusé → busy pour le controller surnuméraire', () => {
    const hub = new LoopbackHub();
    let paired = false;
    const recv = makeCallbacks(() => {
      if (paired) return false; // déjà un controller
      paired = true;
      return true;
    });
    join(hub, 'receiver', recv);

    const ctrl1 = makeCallbacks();
    const c1 = join(hub, 'controller', ctrl1);
    c1.requestConnect(discoveredId(ctrl1));
    expect(ctrl1.onPaired).toHaveBeenCalled();

    const ctrl2 = makeCallbacks();
    const c2 = join(hub, 'controller', ctrl2);
    c2.requestConnect(discoveredId(ctrl2));
    expect(ctrl2.onBusy).toHaveBeenCalledOnce();
    expect(ctrl2.onPaired).not.toHaveBeenCalled();
  });

  it('version incompatible : onVersionMismatch, aucune découverte', () => {
    const hub = new LoopbackHub();
    const recv = makeCallbacks();
    const ctrl = makeCallbacks();
    join(hub, 'receiver', recv);
    join(hub, 'controller', ctrl, PROTOCOL_VERSION + 1);

    expect(recv.onVersionMismatch).toHaveBeenCalled();
    expect(ctrl.onVersionMismatch).toHaveBeenCalled();
    expect(recv.onPeerDiscovered).not.toHaveBeenCalled();
    expect(ctrl.onPeerDiscovered).not.toHaveBeenCalled();
  });

  it('leave → onPeerLost chez le peer restant', () => {
    const hub = new LoopbackHub();
    const recv = makeCallbacks();
    const ctrl = makeCallbacks();
    const recvChannel = join(hub, 'receiver', recv);
    join(hub, 'controller', ctrl);
    const recvId = discoveredId(ctrl);

    void recvChannel.leave();
    expect(ctrl.onPeerLost).toHaveBeenCalledWith(recvId);
  });
});
