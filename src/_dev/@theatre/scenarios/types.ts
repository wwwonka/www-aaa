import type { AppState } from '../../../core/AppOrchestrator'

/** One Theatre.js object within a screen's sheet — usually one per animatable subcomponent (a title, a button...). */
export interface AnimationObject {
  /**
   * Theatre.js object key within the sheet (shows up as the node name in Studio's outline).
   * Also the registry namespace: each prop in `defaults` is pushed to `AnimationRegistry` under
   * `` `${objectKey}.${propKey}` `` — e.g. `objectKey: 'title'` + prop `'opacity'` → `'title.opacity'`.
   */
  objectKey: string
  /** Initial prop values for `sheet.object(objectKey, defaults)` — one entry per animatable numeric prop. */
  defaults: Record<string, number>
  /** `[min, max]` clamp for the Theatre Studio slider, per prop key — e.g. `{ opacity: [0, 1] }`. */
  ranges?: Partial<Record<string, readonly [number, number]>>
}

/**
 * Declarative descriptor for one screen's Theatre.js-authored animation — no logic, just wiring
 * data. A screen can have several independently animatable subcomponents (`objects`), all on the
 * same sheet/timeline so they can be staggered or synced in Studio.
 */
export interface AnimationScenario {
  /** Theatre.js sheet name (one per animated screen). */
  sheetName: string
  /** Orchestrator state whose entry should play this scenario's sequence. */
  triggerState: AppState
  objects: AnimationObject[]
}
