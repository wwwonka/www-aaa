import type { WorkerRefs }  from './resizeHandler'
import { setupResizeHandler }     from './resizeHandler'
import { setupVisibilityHandler } from './visibilityHandler'

// Point d'entrée unique — AppHost appelle cette fonction au démarrage
export function mountEventHandlers(workers: WorkerRefs): void {
  setupResizeHandler(workers)
  setupVisibilityHandler(workers)
}

export type { WorkerRefs }
