import * as studioModule from '@theatre/studio';

// `@theatre/studio`'s CJS build re-wraps its own default export twice through Vite's ESM
// interop (`mod.default.default` is the actual studio instance, not `mod.default`) —
// confirmed by walking the object graph at runtime for whichever level exposes `.initialize`.
const studio = (
  studioModule as unknown as { default: { default: typeof import('@theatre/studio').default } }
).default.default;

let initialized = false;

/** Idempotent — safe to call from multiple scenario setups. DOM-only, DEV-only, main thread. */
export function initStudio(): void {
  if (initialized) return;
  studio.initialize();
  initialized = true;
}

/** Hides the Studio UI overlay without tearing down the project/sheets — used by the 'T' toggle. */
export function hideStudio(): void {
  studio.ui.hide();
}

/** Shows the Studio UI overlay again after `hideStudio()` — used by the 'T' toggle on re-enable. */
export function restoreStudio(): void {
  studio.ui.restore();
}

/**
 * The full on-disk project state (all sheets, all sequences) — same shape `studio` itself would persist.
 *
 * @param projectId - Theatre project id, e.g. `'GameUI'`.
 * @returns Untyped `Record` — see `theatreState.ts#TheatreOnDiskState` for the narrow shape this codebase actually reads.
 */
export function getSaveFileContent(projectId: string): Record<string, unknown> {
  return studio.createContentOfSaveFile(projectId);
}
