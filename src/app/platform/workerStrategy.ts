// Détection du tier de performance au boot (CLAUDE.md §3) : micro-benchmark synthétique
// (< 50 ms) + hardwareConcurrency en heuristique de secours si le résultat est ambigu.
// Décide de la topologie workers (docs/architecture/worker-adaptive-strategy.md) : tier `high` = sim
// worker dédié ; tier `low` = worker unifié Render+Sim et systèmes agiles inline.

export type PerformanceTier = 'low' | 'high';

// Batch fixe : mul-adds Float32 façon produit de matrices — représentatif des boucles
// chaudes sim/render. Chunké pour respecter le budget même sur un device très lent.
const OPS_PER_CHUNK = 50_000;
const MAX_CHUNKS = 40;
const BUDGET_MS = 40; // marge sous les 50 ms exigés par le brief §7

// Calibrage initial (desktop 2026, Chrome) : un tier mobile récent tient largement
// > 30k ops/ms, un device faible tombe < 12k. Entre les deux : les cœurs décident.
// À recalibrer sur vrais devices (iPhone/Android bas de gamme) — log au boot pour ça.
const HIGH_OPS_PER_MS = 30_000;
const LOW_OPS_PER_MS = 12_000;

const scratch = new Float32Array(16);

/**
 * Mesure un débit d'opérations Float32 (ops/ms) sur un batch fixe, borné à {@link BUDGET_MS}.
 * Synchrone et main-thread par construction : il doit s'exécuter AVANT le spawn des workers
 * puisque son résultat décide de leur topologie.
 */
export function benchmarkCompute(): number {
  for (let i = 0; i < 16; i++) scratch[i] = i * 0.37 + 0.11;
  const start = performance.now();
  let ops = 0;
  let acc = 0;
  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    for (let i = 0; i < OPS_PER_CHUNK; i++) {
      const a = scratch[i & 15];
      const b = scratch[(i + 5) & 15];
      acc = a * b + acc * 0.5;
      scratch[(i + 11) & 15] = acc;
    }
    ops += OPS_PER_CHUNK;
    if (performance.now() - start >= BUDGET_MS) break;
  }
  const elapsedMs = Math.max(performance.now() - start, 0.01);
  // `acc` consommé pour interdire l'élimination du calcul par le JIT.
  scratch[0] = acc;
  return ops / elapsedMs;
}

/**
 * Combine benchmark, cœurs logiques et override de debug en un tier.
 *
 * @param opsPerMs - résultat de {@link benchmarkCompute}
 * @param hardwareConcurrency - `navigator.hardwareConcurrency` (cœurs logiques, proxy imparfait)
 * @param forceTier - `?forceTier=low|high` (DEV uniquement) — court-circuite toute détection
 */
export function resolveTier(
  opsPerMs: number,
  hardwareConcurrency: number,
  forceTier: PerformanceTier | null,
): PerformanceTier {
  if (forceTier !== null) return forceTier;
  if (opsPerMs >= HIGH_OPS_PER_MS) return 'high';
  if (opsPerMs <= LOW_OPS_PER_MS) return 'low';
  // Zone ambiguë : l'heuristique statique tranche (≤ 4 cœurs logiques = pas de place
  // pour main + render + sim + système, docs/architecture/worker-adaptive-strategy.md).
  return hardwareConcurrency > 4 ? 'high' : 'low';
}
