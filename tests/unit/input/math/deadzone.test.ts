import { describe, expect, it } from 'vitest';
import { radialDeadzone } from '../../../../src/input/math/deadzone';

const DZ = 0.15;

describe('radialDeadzone', () => {
  it('annule un vecteur sous le seuil', () => {
    expect(radialDeadzone(0.1, 0, DZ)).toEqual({ x: 0, y: 0 });
    expect(radialDeadzone(0.1, 0.1, DZ)).toEqual({ x: 0, y: 0 }); // mag ≈ 0.14 < 0.15
  });

  it('mappe la pleine déflexion à 1', () => {
    const r = radialDeadzone(1, 0, DZ);
    expect(r.x).toBeCloseTo(1, 6);
    expect(r.y).toBeCloseTo(0, 6);
  });

  it('ré-échelonne linéairement depuis le bord de la deadzone', () => {
    // mag = 0.575 → (0.575 - 0.15) / (1 - 0.15) = 0.5 de course utile.
    const r = radialDeadzone(0.575, 0, DZ);
    expect(r.x).toBeCloseTo(0.5, 6);
  });

  it('préserve la direction (radial, pas par-axe)', () => {
    const r = radialDeadzone(0.6, 0.8, DZ); // magnitude 1
    expect(r.x).toBeCloseTo(0.6, 6);
    expect(r.y).toBeCloseTo(0.8, 6);
  });

  it('borne la magnitude à 1 même au-delà de la pleine échelle', () => {
    const r = radialDeadzone(3, 4, DZ); // magnitude 5 → clampée à 1, direction gardée
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(1, 6);
    expect(r.x).toBeCloseTo(0.6, 6);
    expect(r.y).toBeCloseTo(0.8, 6);
  });
});
