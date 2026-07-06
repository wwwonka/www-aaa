import type { WorkerRefs } from './resizeHandler'

/** Pause / reprise quand l'onglet est caché — économise CPU et évite le drift de boucle. */
export function setupVisibilityHandler(workers: WorkerRefs): void {
  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden
    workers.renderWorker.postMessage({ type: 'visibility', hidden })
  })
}
