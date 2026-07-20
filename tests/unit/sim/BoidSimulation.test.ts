import { describe, expect, it } from 'vitest';
import { createBoidSimulation } from '../../../src/sim/BoidSimulation';

// Deux boids éloignés (> BOID_NEIGHBOR_RADIUS) : aucune interaction de voisinage, le seek domine.
const positions = new Float32Array([0, 0, 0, /**/ 10, 0, 0]);
const velocities = new Float32Array(6);

describe('BoidSimulation — cible de seek pendant une onde de demi-tour', () => {
  it('un boid retardé seek l\'ancienne cible, un boid activé la nouvelle', () => {
    const steering = createBoidSimulation(2, 20);
    const forces = new Float32Array(6);

    // Nouvelle cible en (0, +5) ; ancienne en (0, -5). Boid0 activé, boid1 encore retardé.
    steering.compute(positions, velocities, 2, 0, 5, forces, {
      isBoidOnOldTarget: (i) => i === 1,
      oldTargetX: 0,
      oldTargetZ: -5,
    });

    expect(forces[2]).toBeGreaterThan(0); // boid0 → +z (nouvelle cible)
    expect(forces[5]).toBeLessThan(0); // boid1 → -z (ancienne cible, effet fouet)
  });

  it('sans onde, tous les boids seek la cible courante', () => {
    const steering = createBoidSimulation(2, 20);
    const forces = new Float32Array(6);

    steering.compute(positions, velocities, 2, 0, 5, forces);

    expect(forces[2]).toBeGreaterThan(0);
    expect(forces[5]).toBeGreaterThan(0);
  });
});
