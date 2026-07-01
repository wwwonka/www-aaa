import type { WorkerRefs }        from './resizeHandler'
import { setupResizeHandler }       from './resizeHandler'
import { setupVisibilityHandler }   from './visibilityHandler'
import { setupFullscreenHandler }   from './fullscreenHandler'
import { setupPointerHandler }      from './pointerHandler'

// Point d'entrée unique — AppHost appelle cette fonction au démarrage
export function mountEventHandlers(workers: WorkerRefs): void {
  setupResizeHandler(workers)
  setupVisibilityHandler(workers)
  setupFullscreenHandler()
  setupPointerHandler(workers)
}

export type { WorkerRefs }
