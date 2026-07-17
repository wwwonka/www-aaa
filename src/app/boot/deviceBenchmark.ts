// Mesure les performances du device au boot et en DÉDUIT la topologie de threads (CLAUDE.md §3).
// Étape 1 de la séquence de démarrage : un micro-benchmark + le nombre de cœurs décident du `tier`
// (low = worker unifié Render+Sim + systèmes agiles inline), et le `SystemAllocator` place les
// systèmes agiles (AssetsManager) en worker dédié ou inline. Tout est calculé AVANT tout spawn.

import type { QueryFlags } from '../platform/queryFlags';
import { benchmarkCompute, resolveTier } from '../platform/workerStrategy';
import { allocateSystems, type SystemAllocation } from '../../core/SystemAllocator';

/** Profil de perf du device — pilote la topologie de threads (worker unifié en `low`, dédié sinon). */
export type Tier = ReturnType<typeof resolveTier>;

/**
 * Benchmark + décision de topologie. `?forceTier` (DEV uniquement) court-circuite la mesure.
 *
 * @returns `tier` (profil de perf) et `allocation` (worker/inline des systèmes agiles).
 */
export function benchmarkDevice(flags: QueryFlags | undefined): {
  tier: Tier;
  allocation: SystemAllocation<'assetsManager'>;
} {
  const forcedTier = import.meta.env.DEV ? (flags?.forceTier ?? null) : null;
  const opsPerMs = benchmarkCompute();
  const tier = resolveTier(opsPerMs, navigator.hardwareConcurrency, forcedTier);
  console.log(
    `[AppHost] tier=${tier} (bench ${Math.round(opsPerMs)} ops/ms, ` +
      `${navigator.hardwareConcurrency} cœurs${forcedTier ? ', forcé' : ''})`,
  );

  // Un tier low mesuré force l'inline même si le compte de cœurs promettait mieux (voir
  // docs/architecture/system-allocator.md) — sinon la règle N-1 du SystemAllocator décide.
  const allocation =
    tier === 'low'
      ? { mode: 'inline' as const, systems: ['assetsManager' as const] }
      : allocateSystems(navigator.hardwareConcurrency, ['assetsManager'] as const);

  return { tier, allocation };
}
