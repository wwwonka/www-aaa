import type { WorkerRefs } from './resizeHandler'

const RELAYED_TYPES = ['pointerdown', 'pointerup', 'pointermove', 'pointerover', 'pointerout', 'pointerleave', 'wheel'] as const

/**
 * Relays real DOM pointer events from the visible `<canvas>` to the render Worker, where
 * `pointerBridge.ts` redispatches them onto Pixi's `EventSystem` targets. Coordinates are
 * converted to physical pixels (× devicePixelRatio) — with a `domElement` that isn't connected to
 * the DOM (our OffscreenCanvas), Pixi's `mapPositionToPoint` skips the usual CSS→physical
 * conversion and expects physical pixels directly.
 */
export function setupPointerHandler(workers: WorkerRefs): void {
  const { canvas, renderWorker } = workers
  const dpr = window.devicePixelRatio ?? 1

  for (const type of RELAYED_TYPES) {
    canvas.addEventListener(type, (e) => {
      const event = e as PointerEvent
      const rect  = canvas.getBoundingClientRect()

      renderWorker.postMessage({
        type:      'pointer',
        eventType: type,
        x:         (event.clientX - rect.left) * dpr,
        y:         (event.clientY - rect.top)  * dpr,
        pointerId: event.pointerId,
        button:    event.button,
        buttons:   event.buttons,
        ctrlKey:   event.ctrlKey,
        shiftKey:  event.shiftKey,
        altKey:    event.altKey,
        metaKey:   event.metaKey,
      })
    }, type === 'wheel' ? { passive: true } : undefined)
  }
}
