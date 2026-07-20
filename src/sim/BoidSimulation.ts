// Steering boids pur (séparation / alignement / cohésion + seek vers la sphère de contrôle).
// Logique 100% DOD sur Float32Array, plan XZ (la gravité Havok gère l'axe Y) — aucune
// allocation après création, aucun import rendu/DOM (portable en worker, étape 4).
import {
  BOID_SPEED,
  BOID_NEIGHBOR_RADIUS,
  BOID_SEPARATION,
  BOID_ALIGNMENT,
  BOID_COHESION,
  BOID_TARGET_SEEK,
  BOID_MAX_FORCE,
  BOID_MASS_KG,
} from '../shared/config';
import { createSpatialGrid } from './spatialPartitioning';

export interface BoidSteering {
  /**
   * Calcule la force de steering de chaque boid dans `forcesOut` (3 floats/boid, N).
   * @param positions - Positions monde courantes (3 floats/boid).
   * @param velocities - Vélocités courantes (3 floats/boid) — dérivées des positions par l'appelant.
   * @param targetX - Position X de la sphère de contrôle invisible.
   * @param targetZ - Position Z de la sphère de contrôle invisible.
   * @param wave - Onde de demi-tour en cours, ou `null` : un boid dont le délai court encore
   *   seek l'ANCIENNE cible de l'onde (réaction en chaîne depuis le nouveau front, voir ReversalWave).
   */
  compute(
    positions: Float32Array,
    velocities: Float32Array,
    count: number,
    targetX: number,
    targetZ: number,
    forcesOut: Float32Array,
    wave?: {
      isBoidOnOldTarget(boidIndex: number): boolean;
      readonly oldTargetX: number;
      readonly oldTargetZ: number;
    } | null,
  ): void;
}

export function createBoidSimulation(capacity: number, arenaHalfExtent: number): BoidSteering {
  const grid = createSpatialGrid(BOID_NEIGHBOR_RADIUS, arenaHalfExtent, capacity);
  const radiusSq = BOID_NEIGHBOR_RADIUS * BOID_NEIGHBOR_RADIUS;

  // État partagé avec le callback de voisinage persistant — évite une closure par boid/frame.
  let positionsRef: Float32Array;
  let velocitiesRef: Float32Array;
  let selfX = 0;
  let selfZ = 0;
  let sepX = 0;
  let sepZ = 0;
  let alignX = 0;
  let alignZ = 0;
  let cohX = 0;
  let cohZ = 0;
  let neighborCount = 0;

  const visitNeighbor = (j: number): void => {
    const dx = selfX - positionsRef[j * 3];
    const dz = selfZ - positionsRef[j * 3 + 2];
    const distSq = dx * dx + dz * dz;
    if (distSq > radiusSq || distSq < 1e-6) return;
    neighborCount++;
    // Séparation : répulsion inversement proportionnelle à la distance.
    sepX += dx / distSq;
    sepZ += dz / distSq;
    alignX += velocitiesRef[j * 3];
    alignZ += velocitiesRef[j * 3 + 2];
    cohX += positionsRef[j * 3];
    cohZ += positionsRef[j * 3 + 2];
  };

  return {
    compute(positions, velocities, count, targetX, targetZ, forcesOut, wave = null): void {
      positionsRef = positions;
      velocitiesRef = velocities;
      grid.rebuild(positions, count);

      for (let i = 0; i < count; i++) {
        selfX = positions[i * 3];
        selfZ = positions[i * 3 + 2];
        const velX = velocities[i * 3];
        const velZ = velocities[i * 3 + 2];
        sepX = sepZ = alignX = alignZ = cohX = cohZ = 0;
        neighborCount = 0;
        grid.forEachNeighbor(i, visitNeighbor);

        // Seek : vélocité désirée plein régime vers la cible, corrigée de la vélocité actuelle.
        // Pendant une onde de demi-tour, un boid pas encore « atteint » garde l'ancienne cible.
        let tX = targetX;
        let tZ = targetZ;
        if (wave !== null && wave.isBoidOnOldTarget(i)) {
          tX = wave.oldTargetX;
          tZ = wave.oldTargetZ;
        }
        let seekX = tX - selfX;
        let seekZ = tZ - selfZ;
        const seekDist = Math.sqrt(seekX * seekX + seekZ * seekZ);
        if (seekDist > 1e-3) {
          seekX = (seekX / seekDist) * BOID_SPEED - velX;
          seekZ = (seekZ / seekDist) * BOID_SPEED - velZ;
        } else {
          seekX = -velX;
          seekZ = -velZ;
        }

        let accX = seekX * BOID_TARGET_SEEK;
        let accZ = seekZ * BOID_TARGET_SEEK;
        if (neighborCount > 0) {
          const inv = 1 / neighborCount;
          accX += sepX * BOID_SEPARATION;
          accZ += sepZ * BOID_SEPARATION;
          accX += (alignX * inv - velX) * BOID_ALIGNMENT;
          accZ += (alignZ * inv - velZ) * BOID_ALIGNMENT;
          accX += (cohX * inv - selfX) * BOID_COHESION;
          accZ += (cohZ * inv - selfZ) * BOID_COHESION;
        }

        // Force = masse × accélération demandée, clampée pour rester physiquement crédible.
        let fx = accX * BOID_MASS_KG * 10;
        let fz = accZ * BOID_MASS_KG * 10;
        const mag = Math.sqrt(fx * fx + fz * fz);
        if (mag > BOID_MAX_FORCE) {
          const scale = BOID_MAX_FORCE / mag;
          fx *= scale;
          fz *= scale;
        }
        forcesOut[i * 3] = fx;
        forcesOut[i * 3 + 1] = 0;
        forcesOut[i * 3 + 2] = fz;
      }
    },
  };
}
