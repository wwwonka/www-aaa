import type { AppState } from '../../../core/AppOrchestrator';

/** One Theatre.js object within a screen's sheet — usually one per animatable subcomponent (a title, a button...). */
export interface AnimationObject {
  /**
   * Theatre.js object key within the sheet (shows up as the node name in Studio's outline).
   * Also the registry namespace: each animated prop is pushed to `AnimationRegistry` under
   * `` `${objectKey}.${propKey}` `` — e.g. `objectKey: 'title'` + prop `'opacity'` → `'title.opacity'`.
   */
  objectKey: string;
  /**
   * Overrides the shared default transform props (opacity/x/y/scaleX/scaleY/rotation — see
   * `bridge/index.ts`'s `DEFAULT_TRANSFORM_PROPS`) for this object only. Optional — most objects
   * don't need to declare anything here, the defaults already expose every common property in Studio.
   */
  defaults?: Record<string, number>;
  /** `[min, max]` Studio slider clamp per overridden prop key — only meaningful alongside `defaults`. */
  ranges?: Partial<Record<string, readonly [number, number]>>;
}

/**
 * Declarative descriptor for one screen's Theatre.js-authored animation — no logic, just wiring
 * data. A screen can have several independently animatable subcomponents (`objects`), all on the
 * same sheet/timeline so they can be staggered or synced in Studio.
 */
export interface AnimationScenario {
  /** Theatre.js sheet name (one per animated screen). */
  sheetName: string;
  /**
   * Base filename under `public/game/anim/` — explicit, not derived from `sheetName`, to avoid any
   * case-conversion logic (`title-screen.anim.json` for sheet `'TitleScreen'`).
   */
  fileName: string;
  /** Orchestrator state whose entry should play this scenario's sequence. */
  triggerState: AppState;
  /** Independently animatable subcomponents of the screen, all sharing this scenario's sheet. */
  objects: AnimationObject[];
}
