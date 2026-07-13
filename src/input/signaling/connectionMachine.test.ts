import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { Actor } from 'xstate';
import {
  connectionMachine,
  derivePhase,
  DISCOVERY_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
  MAX_HANDSHAKE_ATTEMPTS,
  RETRY_INTERVAL_MS,
} from './connectionMachine';
import type { ConnectionPorts, ConnectionStateValue } from './connectionMachine';

const PEER = { id: 'p1', name: 'SWIFT FOX' } as const;

function makePorts(): ConnectionPorts {
  return { createChannel: vi.fn(), leaveChannel: vi.fn(), requestConnect: vi.fn() };
}

/** Démarre un acteur et l'amène directement en `searching` (idle → joining → searching). */
function startSearching(ports: ConnectionPorts): Actor<typeof connectionMachine> {
  const actor = createActor(connectionMachine, { input: { ports } });
  actor.start();
  actor.send({ type: 'OPEN' });
  actor.send({ type: 'CHANNEL_READY' });
  return actor;
}

const value = (actor: Actor<typeof connectionMachine>): ConnectionStateValue =>
  actor.getSnapshot().value;

describe('connectionMachine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('boote en idle et joint le canal sur OPEN', () => {
    const ports = makePorts();
    const actor = createActor(connectionMachine, { input: { ports } });
    actor.start();
    expect(value(actor)).toBe('idle');

    actor.send({ type: 'OPEN' });
    expect(value(actor)).toBe('joining');
    expect(ports.createChannel).toHaveBeenCalledOnce();

    actor.send({ type: 'CHANNEL_READY' });
    expect(value(actor)).toBe('searching');
  });

  it('room morte : timeout de découverte → error/timeout', () => {
    const actor = startSearching(makePorts());
    vi.advanceTimersByTime(DISCOVERY_TIMEOUT_MS);
    expect(value(actor)).toBe('error');
    expect(actor.getSnapshot().context.errorReason).toBe('timeout');
  });

  it('côté actif : INITIATE_PAIR envoie connect et passe en handshaking', () => {
    const ports = makePorts();
    const actor = startSearching(ports);
    actor.send({ type: 'INITIATE_PAIR', peer: PEER });
    expect(value(actor)).toBe('handshaking');
    expect(ports.requestConnect).toHaveBeenCalledWith(PEER.id);
  });

  it('handshake muet : ré-essaie MAX fois puis abandonne en error/timeout', () => {
    const ports = makePorts();
    const actor = startSearching(ports);
    actor.send({ type: 'INITIATE_PAIR', peer: PEER });

    // Une tentative à l'entrée, puis une par timeout tant que la garde tient.
    for (let i = 0; i < MAX_HANDSHAKE_ATTEMPTS; i++) vi.advanceTimersByTime(HANDSHAKE_TIMEOUT_MS);

    expect(ports.requestConnect).toHaveBeenCalledTimes(MAX_HANDSHAKE_ATTEMPTS);
    expect(value(actor)).toBe('error');
    expect(actor.getSnapshot().context.errorReason).toBe('timeout');
  });

  it('côté passif : PAIRED en searching → paired (pas de connect émis)', () => {
    const ports = makePorts();
    const actor = startSearching(ports);
    actor.send({ type: 'PAIRED', peer: PEER });
    expect(value(actor)).toBe('paired');
    expect(ports.requestConnect).not.toHaveBeenCalled();
    expect(actor.getSnapshot().context.peer).toEqual(PEER);
  });

  it('un second PAIRED ne re-paire pas (idempotent)', () => {
    const actor = startSearching(makePorts());
    actor.send({ type: 'PAIRED', peer: PEER });
    actor.send({ type: 'PAIRED', peer: { id: 'other', name: 'WILD YAK' } });
    expect(value(actor)).toBe('paired');
    expect(actor.getSnapshot().context.peer).toEqual(PEER);
  });

  it('receiver plein : BUSY → error/busy', () => {
    const actor = startSearching(makePorts());
    actor.send({ type: 'INITIATE_PAIR', peer: PEER });
    actor.send({ type: 'BUSY' });
    expect(value(actor)).toBe('error');
    expect(actor.getSnapshot().context.errorReason).toBe('busy');
  });

  it('build distant incompatible : VERSION_MISMATCH → error/version', () => {
    const actor = startSearching(makePorts());
    actor.send({ type: 'VERSION_MISMATCH' });
    expect(value(actor)).toBe('error');
    expect(actor.getSnapshot().context.errorReason).toBe('version');
  });

  it('RETRY quitte et rejoint le canal', () => {
    const ports = makePorts();
    const actor = startSearching(ports);
    vi.advanceTimersByTime(DISCOVERY_TIMEOUT_MS); // → error
    (ports.createChannel as ReturnType<typeof vi.fn>).mockClear();

    actor.send({ type: 'RETRY' });
    expect(value(actor)).toBe('joining');
    expect(ports.leaveChannel).toHaveBeenCalledOnce();
    expect(ports.createChannel).toHaveBeenCalledOnce();
  });

  it('error : auto-rejoin périodique tant que la room est ouverte', () => {
    const ports = makePorts();
    const actor = startSearching(ports);
    vi.advanceTimersByTime(DISCOVERY_TIMEOUT_MS); // → error
    (ports.createChannel as ReturnType<typeof vi.fn>).mockClear();

    vi.advanceTimersByTime(RETRY_INTERVAL_MS);
    expect(value(actor)).toBe('joining');
    expect(ports.leaveChannel).toHaveBeenCalledOnce();
    expect(ports.createChannel).toHaveBeenCalledOnce();
  });

  it('CLOSE quitte le canal et revient idle', () => {
    const ports = makePorts();
    const actor = startSearching(ports);
    actor.send({ type: 'CLOSE' });
    expect(value(actor)).toBe('idle');
    expect(ports.leaveChannel).toHaveBeenCalledOnce();
  });

  it('un timeout ne fuit pas après CLOSE (nettoyage des timers)', () => {
    const actor = startSearching(makePorts());
    actor.send({ type: 'CLOSE' });
    // Sans nettoyage, le timer de découverte referait basculer en error.
    vi.advanceTimersByTime(DISCOVERY_TIMEOUT_MS * 2);
    expect(value(actor)).toBe('idle');
  });

  it('peer pairé perdu → retour searching', () => {
    const actor = startSearching(makePorts());
    actor.send({ type: 'PAIRED', peer: PEER });
    actor.send({ type: 'PEER_LOST' });
    expect(value(actor)).toBe('searching');
    expect(actor.getSnapshot().context.peer).toBeNull();
  });
});

describe('derivePhase', () => {
  it('mappe chaque état vers la phase UI', () => {
    expect(derivePhase('idle', { peer: null, errorReason: null })).toEqual({
      phase: 'searching',
      peerName: null,
    });
    expect(derivePhase('searching', { peer: null, errorReason: null })).toEqual({
      phase: 'searching',
      peerName: null,
    });
    expect(derivePhase('searching', { peer: PEER, errorReason: null })).toEqual({
      phase: 'pairing',
      peerName: PEER.name,
    });
    expect(derivePhase('handshaking', { peer: PEER, errorReason: null })).toEqual({
      phase: 'pairing',
      peerName: PEER.name,
    });
    expect(derivePhase('paired', { peer: PEER, errorReason: null })).toEqual({
      phase: 'paired',
      peerName: PEER.name,
    });
    expect(derivePhase('reconnecting', { peer: PEER, errorReason: null })).toEqual({
      phase: 'reconnecting',
      peerName: PEER.name,
    });
    expect(derivePhase('error', { peer: null, errorReason: 'busy' })).toEqual({
      phase: 'error',
      peerName: null,
      errorReason: 'busy',
    });
  });
});
