/**
 * Host générique de systèmes "agiles" — un seul fichier worker, sans paramètres à la
 * construction, capable d'héberger n'importe quel sous-ensemble de systèmes décidé au runtime
 * par `SystemAllocator` plutôt qu'à la création du worker (pas de query string sur l'URL —
 * casserait l'analyse statique de Vite sur le pattern `new URL(..., import.meta.url)` utilisé
 * par `AppHost.ts` pour le chunking).
 *
 * Remplace l'ancien `assetsManager.worker.ts` codé en dur — voir `docs/architecture/system-allocator.md`.
 */
// En premier — doit être évalué avant tout autre import pour attraper leurs erreurs d'évaluation
// (no-op en prod, voir le fichier).
import '../_dev/workerErrorRelay';
import * as Comlink from 'comlink';
import { systemFactories, type SystemId } from './systems/registry';
import type { SystemLifecycle } from './systems/SystemLifecycle';

const instances = new Map<SystemId, SystemLifecycle>();

/**
 * Instancie (lazy, mis en cache) puis retourne le système demandé.
 *
 * @param id - identifiant du système, doit exister dans `systemFactories`
 * @returns le système, enveloppé via `Comlink.proxy()` — sans ce wrapping, l'objet traverserait
 * la frontière Comlink comme une valeur de retour de RPC (pas la racine exposée) et ses méthodes
 * async seraient perdues au structured clone au lieu de rester appelables à distance.
 */
function get(id: SystemId): SystemLifecycle {
  if (!instances.has(id)) instances.set(id, systemFactories[id]());
  return Comlink.proxy(instances.get(id)!);
}

export type SystemHostApi = { get: typeof get };
Comlink.expose({ get });
