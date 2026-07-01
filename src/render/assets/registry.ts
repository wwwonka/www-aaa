import type { IResourceLoader } from './types'

const registry = new Map<string, IResourceLoader<unknown>>()

/**
 * Registers `loader` for one or more file extensions (without the leading dot, e.g. `'glb'`).
 * Open registry, not a fixed table — adding a new asset format (a future audio library, a
 * particle format, anything unforeseen today) never requires editing this file or `loadAsset.ts`:
 * write the new loader module and have it call this function on import (see `loaders/*.ts` and
 * `registerDefaultLoaders.ts`).
 */
export function registerLoader(extensions: string[], loader: IResourceLoader<unknown>): void {
  for (const ext of extensions) registry.set(ext, loader)
}

/** Looks up the loader registered for `ext` (no leading dot). Returns `undefined` if none matches. */
export function getLoader(ext: string): IResourceLoader<unknown> | undefined {
  return registry.get(ext)
}

/**
 * Default {@link IResourceLoader.resolve} strategy: `fetch('/' + path)` → `Blob`. Relies entirely
 * on the Service Worker (`src/app/platform/assetCacheFetch.ts`) to serve cached bytes from
 * IndexedDB transparently — never reads `assetDb.ts`/IndexedDB directly here, to keep a single
 * source of truth for "is this asset cached".
 */
export const defaultResolve = async (path: string): Promise<Blob> => {
  const response = await fetch('/' + path)
  if (!response.ok) throw new Error(`loadAsset: fetch failed for "${path}" (${response.status})`)
  return response.blob()
}
