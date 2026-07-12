// Grille spatiale uniforme (hash 2D XZ) pour les requêtes de voisinage des boids.
// DOD : listes chaînées intrusives dans des Int32Array — zéro allocation après création.
// Surdimensionné pour 24 boids (O(n²) suffirait) mais prêt si BOID_COUNT remonte.

export interface SpatialGrid {
  /** Reconstruit la grille depuis les positions courantes (3 floats par entité, layout xyz). */
  rebuild(positions: Float32Array, count: number): void;
  /**
   * Itère les voisins potentiels de l'entité `index` (cellules 3x3 autour d'elle, `index` exclu).
   * L'appelant filtre par distance réelle — la grille ne garantit que le voisinage large.
   */
  forEachNeighbor(index: number, visit: (neighborIndex: number) => void): void;
}

/**
 * @param cellSize - Taille de cellule en unités monde ; utiliser le rayon de voisinage des boids.
 * @param halfExtent - Demi-étendue du monde couvert (les positions hors bornes sont clampées).
 * @param capacity - Nombre maximal d'entités indexables.
 */
export function createSpatialGrid(
  cellSize: number,
  halfExtent: number,
  capacity: number,
): SpatialGrid {
  const cellsPerSide = Math.max(1, Math.ceil((halfExtent * 2) / cellSize));
  const cellCount = cellsPerSide * cellsPerSide;
  // head[cell] = premier index d'entité de la cellule (-1 si vide) ; next[i] = entité suivante.
  const head = new Int32Array(cellCount);
  const next = new Int32Array(capacity);
  const cellOf = new Int32Array(capacity);

  const cellIndex = (x: number, z: number): number => {
    let cx = Math.floor((x + halfExtent) / cellSize);
    let cz = Math.floor((z + halfExtent) / cellSize);
    if (cx < 0) cx = 0;
    else if (cx >= cellsPerSide) cx = cellsPerSide - 1;
    if (cz < 0) cz = 0;
    else if (cz >= cellsPerSide) cz = cellsPerSide - 1;
    return cz * cellsPerSide + cx;
  };

  return {
    rebuild(positions: Float32Array, count: number): void {
      head.fill(-1);
      for (let i = 0; i < count; i++) {
        const cell = cellIndex(positions[i * 3], positions[i * 3 + 2]);
        cellOf[i] = cell;
        next[i] = head[cell];
        head[cell] = i;
      }
    },

    forEachNeighbor(index: number, visit: (neighborIndex: number) => void): void {
      const cell = cellOf[index];
      const cx = cell % cellsPerSide;
      const cz = (cell / cellsPerSide) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        const z = cz + dz;
        if (z < 0 || z >= cellsPerSide) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= cellsPerSide) continue;
          for (let i = head[z * cellsPerSide + x]; i !== -1; i = next[i]) {
            if (i !== index) visit(i);
          }
        }
      }
    },
  };
}
