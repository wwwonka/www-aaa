import type { Scene } from '@babylonjs/core/pure';

/**
 * Engine handles a loader's {@link ResourceLoader.parse} may need. Optional field by field —
 * today only {@link ResourceLoader} implementations for mesh/texture formats need `scene`.
 */
export interface LoaderContext {
  scene?: Scene;
}

/**
 * Contract every asset loader registered via `registerLoader` (see `registry.ts`) must implement.
 * Kept in `src/render/` (not `src/core/`) on purpose — `parse()` produces engine objects
 * (Babylon `Mesh`, `Texture`, `AudioBuffer`...), so this type must never be imported from
 * `src/core/AssetsManager.ts`, which stays agnostic of the render engine.
 */
export interface ResourceLoader<T> {
  /**
   * Fetches the raw bytes for `path`. Defaults to `defaultResolve` (plain `fetch`, transparently
   * served from IndexedDB by the Service Worker) when omitted — see `registry.ts`. Override this
   * only when a format needs a different resolution strategy (streaming, preloaded dependencies,
   * a dedicated store).
   */
  resolve?(path: string): Promise<Blob>;
  /**
   * Turns the raw `Blob` into a "Game-Ready" object. Any post-load initialization (baking
   * transforms, GPU upload, etc.) must happen here — callers of `loadAsset`/`loadMesh`/etc. never
   * perform extra steps after the returned Promise resolves.
   */
  parse(blob: Blob, path: string, ctx: LoaderContext): Promise<T>;
}
