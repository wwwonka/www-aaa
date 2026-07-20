// Golden test for a real regression (2026-07-20) : `sendStart()` called `start.send(null)` with
// no `{ target: peerId }`, unlike every other targeted send in this file — it broadcast PLAY to
// the whole room instead of only the paired peer. Locks the fixed contract: `sendStart` must wire
// the SAME peerId-targeting pattern as `sendHandoffRequest`/`sendHandoffState`/`sendHandoffAck`.
import { describe, expect, it, vi } from 'vitest';
import type { PairingChannelCallbacks } from '../../../../src/input/signaling/types';

interface FakeAction {
  send: ReturnType<typeof vi.fn>;
  onMessage: unknown;
}

const actionsByNamespace = new Map<string, FakeAction>();

vi.mock('@trystero-p2p/nostr', () => ({
  joinRoom: vi.fn(() => ({
    makeAction: vi.fn((namespace: string) => {
      const action: FakeAction = { send: vi.fn().mockResolvedValue(undefined), onMessage: null };
      actionsByNamespace.set(namespace, action);
      return action;
    }),
    onPeerJoin: null,
    onPeerLeave: null,
    leave: vi.fn().mockResolvedValue(undefined),
  })),
}));

const { createTrysteroPairingChannel } = await import('../../../../src/input/signaling/PairingChannel');

function noopCallbacks(): PairingChannelCallbacks {
  return {
    onPeerDiscovered: () => {},
    onPeerLost: () => {},
    onPairRequest: () => true,
    onBusy: () => {},
    onVersionMismatch: () => {},
    onPaired: () => {},
    onStart: () => {},
    onInput: () => {},
    onHandoffRequest: () => {},
    onHandoffState: () => {},
    onHandoffAck: () => {},
  };
}

describe('PairingChannel.sendStart — targets only the paired peer, never a room broadcast', () => {
  it('sends { target: peerId }, exactly like sendHandoffRequest/State/Ack', () => {
    actionsByNamespace.clear();
    const channel = createTrysteroPairingChannel({
      role: 'receiver',
      roomId: 'ABCDE',
      deviceName: 'Test Device',
      callbacks: noopCallbacks(),
    });

    channel.sendStart('peer-123');
    channel.sendHandoffRequest('peer-123');

    const start = actionsByNamespace.get('start');
    const hoReq = actionsByNamespace.get('hoReq');
    expect(start?.send).toHaveBeenCalledWith(null, { target: 'peer-123' });
    // Same targeting shape as a sibling send that was never buggy — the two must match.
    expect(hoReq?.send).toHaveBeenCalledWith(null, { target: 'peer-123' });
  });

  it('never calls send with no options (that shape is exactly the old broadcast bug)', () => {
    actionsByNamespace.clear();
    const channel = createTrysteroPairingChannel({
      role: 'receiver',
      roomId: 'ABCDE',
      deviceName: 'Test Device',
      callbacks: noopCallbacks(),
    });

    channel.sendStart('peer-456');

    const start = actionsByNamespace.get('start');
    expect(start?.send).not.toHaveBeenCalledWith(null);
    expect(start?.send).toHaveBeenCalledTimes(1);
  });
});
