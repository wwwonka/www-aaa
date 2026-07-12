/** Refs shared by the DOM-side event handlers to relay browser events to the render worker. */
export interface WorkerRefs {
  canvas: HTMLCanvasElement;
  renderWorker: Worker;
}

// Safari ne supporte pas 'device-pixel-content-box' — on détecte le support au runtime
const supportsDevicePixelBox = (() => {
  try {
    const o = new ResizeObserver(() => {});
    o.observe(document.createElement('div'), { box: 'device-pixel-content-box' });
    o.disconnect();
    return true;
  } catch {
    return false;
  }
})();

/**
 * Relaie les resize DOM au render worker — OffscreenCanvas n'a pas accès à window.
 * Le worker applique le resize + re-render dans le même tick pour éviter tout flash.
 */
export function setupResizeHandler(workers: WorkerRefs): void {
  const { canvas, renderWorker } = workers;
  const dpr = window.devicePixelRatio ?? 1;

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const size = entry.devicePixelContentBoxSize?.[0];
      const w = size ? size.inlineSize : Math.round(entry.contentRect.width * dpr);
      const h = size ? size.blockSize : Math.round(entry.contentRect.height * dpr);
      renderWorker.postMessage({ type: 'resize', width: w, height: h });
    }
  });

  const box = supportsDevicePixelBox ? 'device-pixel-content-box' : 'content-box';
  observer.observe(canvas, { box });
}
