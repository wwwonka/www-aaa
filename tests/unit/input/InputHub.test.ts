import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputHub } from '../../../src/input/InputHub';
import { createControllerFrame } from '../../../src/input/ControllerFrame';
import type { InputSource, InputSourceKind } from '../../../src/input/sources/InputSource';

// Source factice pilotable : on règle ses DEUX sticks à la même valeur (la locomotion exige les
// deux sticks actifs — la moyenne rend alors la valeur telle quelle), le hub calcule l'activité.
class FakeSource implements InputSource {
  readonly kind: InputSourceKind;
  readonly frame = createControllerFrame();
  starts = 0;
  stops = 0;

  constructor(kind: InputSourceKind = 'gamepad') {
    this.kind = kind;
  }

  start(): void {
    this.starts++;
  }
  stop(): void {
    this.stops++;
  }
  poll(): typeof this.frame {
    return this.frame;
  }

  setSticks(x: number, z: number): void {
    this.frame.leftStick.x = x;
    this.frame.leftStick.z = z;
    this.frame.rightStick.x = x;
    this.frame.rightStick.z = z;
  }

  setActions(bitset: number): void {
    this.frame.actions = bitset;
  }
}

// --- rAF + horloge simulés : on avance nous-mêmes, un tick = un pas de SAMPLE_MS (33 ms) ---
let now = 0;
let rafCb: FrameRequestCallback | null = null;

beforeEach(() => {
  now = 0;
  rafCb = null;
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    rafCb = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', (): void => {
    rafCb = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Avance l'horloge de 33 ms et déclenche exactement un échantillonnage du hub. */
function tick(): void {
  now += 33;
  const cb = rafCb;
  rafCb = null;
  cb?.(now);
}

describe('InputHub — arbitrage latest-active-wins', () => {
  it('émet les axes réduits de la seule source active', () => {
    const sink = vi.fn();
    const hub = new InputHub({ axisSink: sink });
    const pad = new FakeSource();
    hub.register(pad);
    hub.start();

    pad.setSticks(0.5, 0);
    tick();

    expect(sink).toHaveBeenLastCalledWith(0.5, 0);
    expect(pad.starts).toBe(1);
  });

  it('donne la main à la source qui a bougé le plus récemment, puis la rend au recentrage', () => {
    const sink = vi.fn();
    const hub = new InputHub({ axisSink: sink });
    const a = new FakeSource('gamepad');
    const b = new FakeSource('touch');
    hub.register(a);
    hub.register(b);
    hub.start();

    a.setSticks(0.5, 0);
    tick();
    expect(sink).toHaveBeenLastCalledWith(0.5, 0); // A possède

    b.setSticks(-0.5, 0);
    tick();
    expect(sink).toHaveBeenLastCalledWith(-0.5, 0); // B a bougé en dernier → B possède

    // A tient toujours son stick mais ne re-déclenche pas d'engagement → B garde la main.
    tick();
    expect(sink).toHaveBeenLastCalledWith(-0.5, 0);

    // B recentre → A (toujours actif) reprend la sortie.
    b.setSticks(0, 0);
    tick();
    expect(sink).toHaveBeenLastCalledWith(0.5, 0);
  });

  it('émet un vecteur nul quand plus aucune source n\'est active', () => {
    const sink = vi.fn();
    const hub = new InputHub({ axisSink: sink });
    const pad = new FakeSource();
    hub.register(pad);
    hub.start();

    pad.setSticks(0.5, 0);
    tick();
    pad.setSticks(0, 0);
    tick();

    expect(sink).toHaveBeenLastCalledWith(0, 0);
  });

  it('à l\'arrêt, stoppe les sources et force des axes nuls (pas d\'axes fantômes)', () => {
    const sink = vi.fn();
    const hub = new InputHub({ axisSink: sink });
    const pad = new FakeSource();
    hub.register(pad);
    hub.start();

    pad.setSticks(0.8, 0);
    tick();
    sink.mockClear();

    hub.stop();
    expect(sink).toHaveBeenCalledWith(0, 0);
    expect(pad.stops).toBe(1);

    // Après stop, plus aucun échantillonnage même si on tente d'avancer l'horloge.
    sink.mockClear();
    tick();
    expect(sink).not.toHaveBeenCalled();
  });
});

describe('InputHub — actions (edge-detection, hors arbitrage)', () => {
  const CONFIRM = 3; // ACTION_ID.CONFIRM — bit `1 << id` dans la frame

  function makeHub(): { hub: InputHub; pad: FakeSource; touch: FakeSource; actions: number[] } {
    const actions: number[] = [];
    const pad = new FakeSource('gamepad');
    const touch = new FakeSource('touch');
    const hub = new InputHub({
      axisSink: () => {},
      actionSink: (id) => actions.push(id),
    });
    hub.register(pad);
    hub.register(touch);
    hub.start();
    return { hub, pad, touch, actions };
  }

  it('émet une action une seule fois par front montant, puis à nouveau après relâche', () => {
    const { pad, actions } = makeHub();

    pad.setActions(1 << CONFIRM);
    tick();
    tick(); // maintien → pas de ré-émission
    expect(actions).toEqual([CONFIRM]);

    pad.setActions(0);
    tick(); // relâche
    pad.setActions(1 << CONFIRM);
    tick(); // nouvelle pression → nouveau front
    expect(actions).toEqual([CONFIRM, CONFIRM]);
  });

  it('voit les actions même quand une AUTRE source possède les axes', () => {
    const { pad, touch, actions } = makeHub();

    touch.setSticks(0.5, 0); // le tactile prend la main sur les axes
    tick();
    pad.setActions(1 << CONFIRM); // bouton manette, sticks manette au neutre
    tick();
    expect(actions).toEqual([CONFIRM]);
  });

  it('au stop, oublie l\'état tenu : une action encore pressée re-fronte à la reprise', () => {
    const { hub, pad, actions } = makeHub();

    pad.setActions(1 << CONFIRM);
    tick();
    expect(actions).toEqual([CONFIRM]);

    hub.stop();
    hub.start();
    tick(); // toujours pressée → nouveau front après reprise
    expect(actions).toEqual([CONFIRM, CONFIRM]);
  });

  it('sans actionSink, les actions sont ignorées sans erreur et les axes coulent normalement', () => {
    const axisSink = vi.fn();
    const hub = new InputHub({ axisSink });
    const pad = new FakeSource();
    hub.register(pad);
    hub.start();

    pad.setActions(1 << CONFIRM);
    pad.setSticks(0.5, 0);
    tick();
    expect(axisSink).toHaveBeenLastCalledWith(0.5, 0);
  });
});
