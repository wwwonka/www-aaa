import { describe, expect, it } from 'vitest';
import { reduceSticks } from '../../../../src/input/math/stickReducer';

describe('reduceSticks', () => {
  it('rend un vecteur nul quand aucun stick n\'est actif', () => {
    expect(reduceSticks({ x: 0, z: 0 }, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
  });

  it('rend le seul stick actif (clampé)', () => {
    expect(reduceSticks({ x: 1, z: 0 }, { x: 0, z: 0 })).toEqual({ x: 1, z: 0 });
    expect(reduceSticks({ x: 0, z: 0 }, { x: 0, z: -1 })).toEqual({ x: 0, z: -1 });
  });

  it('moyenne deux sticks actifs quand la magnitude reste ≤ 1', () => {
    expect(reduceSticks({ x: 1, z: 0 }, { x: 0, z: 1 })).toEqual({ x: 0.5, z: 0.5 });
  });

  it('renormalise quand la moyenne dépasse le cercle unité', () => {
    const r = reduceSticks({ x: 1, z: 1 }, { x: 1, z: 1 }); // moyenne (1,1), mag √2 > 1
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 6);
    expect(r.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(r.z).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
