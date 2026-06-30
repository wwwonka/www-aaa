import { createAssetsManager } from '../AssetsManager'
import type { SystemLifecycle } from './SystemLifecycle'

/**
 * Identifiants des systèmes "agiles" (compressibles, au sens de `docs/system-allocator.md`)
 * que `SystemHost.worker.ts` peut instancier via `get(id)`. Extension future : un seul système
 * agile (`AssetsManager`) existe réellement aujourd'hui — Simulation/Audio/Network rejoindront
 * cette union le jour où ils cesseront d'être des stubs.
 */
export type SystemId = 'assetsManager'

/**
 * Table `SystemId → factory`. Chaque factory doit retourner un objet conforme à
 * {@link SystemLifecycle}. Ajouter un système ne demande qu'une entrée ici (+ l'id dans
 * {@link SystemId}) — ni `SystemHost.worker.ts` ni `SystemAllocator.ts` n'ont à changer.
 */
export const systemFactories: Record<SystemId, () => SystemLifecycle> = {
  assetsManager: createAssetsManager,
}
