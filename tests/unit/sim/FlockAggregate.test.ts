import { describe, expect, it } from 'vitest';
import { createFlockAggregate } from '../../../src/sim/FlockAggregate';

/** Positions XZ → buffer 3 floats/boid (Y à 0, ignoré par l'agrégat). */
function positionsOf(points: readonly (readonly [number, number])[]): Float32Array {
  const buf = new Float32Array(points.length * 3);
  points.forEach(([x, z], i) => {
    buf[i * 3] = x;
    buf[i * 3 + 2] = z;
  });
  return buf;
}

describe('FlockAggregate', () => {
  it('calcule le centroïde et le rayon (distance max au centroïde) sur le plan XZ', () => {
    const flock = createFlockAggregate();
    // Carré centré en (1, 2), coin le plus loin à √2 du centre.
    flock.update(positionsOf([[0, 1], [2, 1], [0, 3], [2, 3]]), 4);

    expect(flock.centroidX).toBeCloseTo(1, 6);
    expect(flock.centroidZ).toBeCloseTo(2, 6);
    expect(flock.radius).toBeCloseTo(Math.SQRT2, 6);
  });

  it('N=1 : centroïde = la position, rayon nul', () => {
    const flock = createFlockAggregate();
    flock.update(positionsOf([[-3, 7]]), 1);

    expect(flock.centroidX).toBeCloseTo(-3, 6);
    expect(flock.centroidZ).toBeCloseTo(7, 6);
    expect(flock.radius).toBe(0);
  });

  it('vitesse moyenne calculée quand les vélocités sont fournies, conservée sinon', () => {
    const flock = createFlockAggregate();
    const positions = positionsOf([[0, 0], [1, 0]]);
    const velocities = new Float32Array([2, 0, 0, /**/ 4, 0, -2]);

    flock.update(positions, 2, velocities);
    expect(flock.meanVelX).toBeCloseTo(3, 6);
    expect(flock.meanVelZ).toBeCloseTo(-1, 6);

    flock.update(positions, 2); // sans vélocités → dernière valeur conservée
    expect(flock.meanVelX).toBeCloseTo(3, 6);
  });

  it('count=0 : no-op (agrégat inchangé)', () => {
    const flock = createFlockAggregate();
    flock.update(positionsOf([[5, 5]]), 1);
    flock.update(new Float32Array(0), 0);

    expect(flock.centroidX).toBeCloseTo(5, 6);
    expect(flock.centroidZ).toBeCloseTo(5, 6);
  });
});
