/** `'worker'` — héberger dans un `SystemHost.worker.ts` dédié. `'inline'` — appeler la factory directement sur le main thread (coût nul, les factories sont portables). */
export type AllocationMode = 'worker' | 'inline';

/** Résultat de {@link allocateSystems} : où faire tourner les systèmes agiles demandés, et lesquels. */
export interface SystemAllocation<T extends string> {
  mode: AllocationMode;
  systems: T[];
}

/**
 * Décide si les systèmes "agiles" (compressibles — voir `docs/architecture/system-allocator.md`) tournent
 * dans un `SystemHost` worker dédié ou inline sur le main thread, selon le nombre de cœurs
 * logiques disponibles.
 *
 * Règle N-1 : on réserve toujours un cœur pour le Main Thread. Le Render Worker est l'ancre
 * (non-compressible, déjà câblé en dur dans `AppHost.ts`) et consomme un slot à lui seul. S'il
 * ne reste aucun slot pour les systèmes agiles, ils tournent inline sur le main thread — les
 * factories (`createAssetsManager`, etc.) sont déjà portables, ce coût est nul.
 *
 * @param hardwareConcurrency - `navigator.hardwareConcurrency`, nombre de cœurs logiques rapportés
 * @param agileSystems - identifiants des systèmes agiles à placer (ex: `['assetsManager']`)
 * @returns le mode choisi et la liste des systèmes inchangée, pour que l'appelant sache quoi instancier où
 * @see docs/architecture/system-allocator.md
 * @see docs/architecture/worker-adaptive-strategy.md
 */
export function allocateSystems<T extends string>(
  hardwareConcurrency: number,
  agileSystems: T[],
): SystemAllocation<T> {
  const availableSlots = Math.max(1, hardwareConcurrency - 1);
  const remainingAfterRenderAnchor = availableSlots - 1;
  return {
    mode: remainingAfterRenderAnchor >= 1 ? 'worker' : 'inline',
    systems: agileSystems,
  };
}
