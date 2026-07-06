import type { WorkerRefs } from './resizeHandler';
import { setupResizeHandler } from './resizeHandler';
import { setupVisibilityHandler } from './visibilityHandler';
import { setupFullscreenHandler } from './fullscreenHandler';
import { setupPointerHandler } from './pointerHandler';

/**
 * Point d'entrée unique — AppHost appelle cette fonction au démarrage pour attacher
 * tous les handlers DOM (resize, visibility, fullscreen, pointer) qui relaient les
 * événements de la page vers le render worker.
 */
export function mountEventHandlers(workers: WorkerRefs): void {
  setupResizeHandler(workers);
  setupVisibilityHandler(workers);
  setupFullscreenHandler();
  setupPointerHandler(workers);
}

export type { WorkerRefs };
