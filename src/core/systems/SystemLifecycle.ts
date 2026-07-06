/**
 * Cycle de vie commun implémenté par tout système hébergeable via `SystemHost.worker.ts`'s
 * `get(id)`. Le host instancie physiquement le système ; il ne décide jamais de l'ordre logique
 * de démarrage — c'est `AppOrchestrator` qui appelle {@link startUp} une fois l'instance
 * obtenue, pour garder le contrôle des dépendances entre systèmes.
 *
 * @see docs/system-allocator.md
 */
export interface SystemLifecycle {
  /** Démarre le système (ex: warm-up des assets). Appelé par AppOrchestrator, jamais par le host. */
  startUp(): Promise<void>;
  /** Libère les ressources tenues par le système (connexions, timers). No-op si rien à libérer. */
  shutDown(): Promise<void>;
}
