import type { WebGLRenderer } from 'pixi.js'

/** Relayed pointer/mouse event payload, as forwarded from `src/app/events/pointerHandler.ts` on the main thread. */
export interface RelayedPointerData {
  eventType: string
  x:         number
  y:         number
  pointerId?: number
  button?:    number
  buttons?:   number
  ctrlKey?:   boolean
  shiftKey?:  boolean
  altKey?:    boolean
  metaKey?:   boolean
}

// `EventSystem._addEvents()` pose ses listeners sur des cibles différentes selon le type d'événement
// (voir node_modules/pixi.js/lib/events/EventSystem.js) :
// - pointerdown/pointerover/pointerout/pointerleave/wheel  → this.domElement (notre OffscreenCanvas)
// - pointermove/mousemove                                   → globalThis.document (portée globale)
// - pointerup/mouseup                                       → globalThis (portée window)
const DOM_ELEMENT_EVENTS = new Set(['pointerdown', 'mousedown', 'pointerover', 'mouseover', 'pointerout', 'mouseout', 'pointerleave', 'wheel', 'touchstart', 'touchend', 'touchmove'])
const DOCUMENT_EVENTS    = new Set(['pointermove', 'mousemove'])
// tout le reste (pointerup/mouseup) part sur `globalThis`

const POINTER_TO_MOUSE: Record<string, string> = {
  pointerdown: 'mousedown',
  pointermove: 'mousemove',
  pointerup:   'mouseup',
  pointerover: 'mouseover',
  pointerout:  'mouseout',
}

/**
 * Dispatches a relayed main-thread pointer event onto whichever target Pixi's `EventSystem` actually listens on.
 *
 * @param canvas - The render worker's `OffscreenCanvas` — target for `pointerdown`/`over`/`out`/`leave`/`wheel`.
 * @param renderer - Pixi's `WebGLRenderer`; used only to check `events.supportsPointerEvents` for the mouse-event fallback.
 * @param data - Relayed event payload from `src/app/events/pointerHandler.ts` (already in physical pixels).
 */
export function dispatchPointerEvent(canvas: OffscreenCanvas, renderer: WebGLRenderer, data: RelayedPointerData): void {
  const usesPointerEvents = renderer.events.supportsPointerEvents
  const type = usesPointerEvents || !(data.eventType in POINTER_TO_MOUSE) ? data.eventType : POINTER_TO_MOUSE[data.eventType]

  const evt = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    clientX:  data.x,
    clientY:  data.y,
    pointerId: data.pointerId ?? 1,
    button:    data.button ?? 0,
    buttons:   data.buttons ?? 0,
    ctrlKey:   data.ctrlKey ?? false,
    shiftKey:  data.shiftKey ?? false,
    altKey:    data.altKey ?? false,
    metaKey:   data.metaKey ?? false,
  })

  if (DOM_ELEMENT_EVENTS.has(type)) {
    canvas.dispatchEvent(evt)
  } else if (DOCUMENT_EVENTS.has(type)) {
    ;(globalThis as unknown as { document: EventTarget }).document.dispatchEvent(evt)
  } else {
    self.dispatchEvent(evt)
  }
}
