// Le flock comme ENTITÉ : agrégat DOD recalculé chaque step depuis les positions (centroïde XZ,
// rayon = distance max au centroïde, vitesse moyenne XZ). O(N), zéro allocation après création,
// aucun import rendu/DOM. Première brique réutilisable : demi-tour intentionnel (ReversalWave)
// aujourd'hui ; split, prédateurs, cadrage caméra demain.

export interface FlockAggregate {
  readonly centroidX: number;
  readonly centroidZ: number;
  /** Distance du boid le plus éloigné au centroïde (0 si N=1). */
  readonly radius: number;
  readonly meanVelX: number;
  readonly meanVelZ: number;
  /**
   * Recalcule l'agrégat depuis les buffers courants (3 floats/boid, plan XZ — Y ignoré).
   * @param velocities - optionnel : sans lui, la vitesse moyenne reste à sa dernière valeur.
   */
  update(positions: Float32Array, count: number, velocities?: Float32Array): void;
}

export function createFlockAggregate(): FlockAggregate {
  let centroidX = 0;
  let centroidZ = 0;
  let radius = 0;
  let meanVelX = 0;
  let meanVelZ = 0;

  return {
    get centroidX() {
      return centroidX;
    },
    get centroidZ() {
      return centroidZ;
    },
    get radius() {
      return radius;
    },
    get meanVelX() {
      return meanVelX;
    },
    get meanVelZ() {
      return meanVelZ;
    },

    update(positions, count, velocities): void {
      if (count <= 0) return;
      const inv = 1 / count;

      let sumX = 0;
      let sumZ = 0;
      for (let i = 0; i < count; i++) {
        sumX += positions[i * 3];
        sumZ += positions[i * 3 + 2];
      }
      centroidX = sumX * inv;
      centroidZ = sumZ * inv;

      let maxDistSq = 0;
      for (let i = 0; i < count; i++) {
        const dx = positions[i * 3] - centroidX;
        const dz = positions[i * 3 + 2] - centroidZ;
        const distSq = dx * dx + dz * dz;
        if (distSq > maxDistSq) maxDistSq = distSq;
      }
      radius = Math.sqrt(maxDistSq);

      if (velocities !== undefined) {
        let sumVx = 0;
        let sumVz = 0;
        for (let i = 0; i < count; i++) {
          sumVx += velocities[i * 3];
          sumVz += velocities[i * 3 + 2];
        }
        meanVelX = sumVx * inv;
        meanVelZ = sumVz * inv;
      }
    },
  };
}
