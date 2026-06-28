export interface WorkerRefs {
  canvas:       HTMLCanvasElement
  renderWorker: Worker
}

// ResizeObserver sur le canvas — plus précis que window.resize, inclut le zoom browser
// devicePixelContentBoxSize donne les dimensions en pixels physiques sans calcul manuel
export function setupResizeHandler(workers: WorkerRefs): void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const size = entry.devicePixelContentBoxSize?.[0]
      const w = size ? size.inlineSize  : Math.round(entry.contentRect.width  * (window.devicePixelRatio ?? 1))
      const h = size ? size.blockSize   : Math.round(entry.contentRect.height * (window.devicePixelRatio ?? 1))
      workers.renderWorker.postMessage({ type: 'resize', width: w, height: h })
    }
  })

  observer.observe(workers.canvas, { box: 'device-pixel-content-box' })
}
