import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputHub } from '../../../src/input/InputHub';
import { createControllerFrame } from '../../../src/input/ControllerFrame';
import type { InputSource, InputSourceKind } from '../../../src/input/sources/InputSource';

// Source factice pilotable : on règle son stick gauche, le hub calcule l'activité depuis la frame.
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

  setLeft(x: number, z: number): void {
    this.frame.leftStick.x = x;
    this.frame.leftStick.z = z;
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

    pad.setLeft(0.5, 0);
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

    a.setLeft(0.5, 0);
    tick();
    expect(sink).toHaveBeenLastCalledWith(0.5, 0); // A possède

    b.setLeft(-0.5, 0);
    tick();
    expect(sink).toHaveBeenLastCalledWith(-0.5, 0); // B a bougé en dernier → B possède

    // A tient toujours son stick mais ne re-déclenche pas d'engagement → B garde la main.
    tick();
    expect(sink).toHaveBeenLastCalledWith(-0.5, 0);

    // B recentre → A (toujours actif) reprend la sortie.
    b.setLeft(0, 0);
    tick();
    expect(sink).toHaveBeenLastCalledWith(0.5, 0);
  });

  it('émet un vecteur nul quand plus aucune source n\'est active', () => {
    const sink = vi.fn();
    const hub = new InputHub({ axisSink: sink });
    const pad = new FakeSource();
    hub.register(pad);
    hub.start();

    pad.setLeft(0.5, 0);
    tick();
    pad.setLeft(0, 0);
    tick();

    expect(sink).toHaveBeenLastCalledWith(0, 0);
  });

  it('à l\'arrêt, stoppe les sources et force des axes nuls (pas d\'axes fantômes)', () => {
    const sink = vi.fn();
    const hub = new InputHub({ axisSink: sink });
    const pad = new FakeSource();
    hub.register(pad);
    hub.start();

    pad.setLeft(0.8, 0);
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
