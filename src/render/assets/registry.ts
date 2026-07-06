import type { ResourceLoader } from './types';

interface RegistryEntry<T> {
  loader: ResourceLoader<T>;
  /** Folder name under `public/<namespace>/` this asset type lives in — e.g. `'font'`, `'mesh'`. */
  type: string;
}

const registry = new Map<string, RegistryEntry<unknown>>();

/**
 * Registers `loader` for one or more file extensions (without the leading dot, e.g. `'glb'`),
 * along with the folder `type` it lives under (e.g. `'mesh'`) — lets `loadAsset` resolve a bare
 * filename (`loadAsset('fezbox.otf')`) to its full path without callers ever calling `assetPath()`
 * themselves. Open registry, not a fixed table — adding a new asset format never requires editing
 * this file or `loadAsset.ts`: write the new loader module and have it call this function on
 * import (see `loaders/*.ts` and `registerDefaultLoaders.ts`).
 *
 * @param extensions - File extensions this loader handles, without the leading dot (e.g. `['glb', 'gltf']`).
 * @param type - Folder name under `public/<namespace>/` this asset type lives in (e.g. `'mesh'`).
 * @param loader - The loader implementation to register.
 */
export function registerLoader(
  extensions: string[],
  type: string,
  loader: ResourceLoader<unknown>,
): void {
  for (const ext of extensions) registry.set(ext, { loader, type });
}

/**
 * Looks up the registry entry for `ext` (no leading dot).
 *
 * @returns The matching `{ loader, type }` entry, or `undefined` if none was registered.
 */
export function getLoaderEntry(ext: string): RegistryEntry<unknown> | undefined {
  return registry.get(ext);
}

/**
 * Default {@link ResourceLoader.resolve} strategy: `fetch('/' + path)` → `Blob`. Relies entirely
 * on the Service Worker (`src/app/platform/assetCacheFetch.ts`) to serve cached bytes from
 * IndexedDB transparently — never reads `assetDb.ts`/IndexedDB directly here, to keep a single
 * source of truth for "is this asset cached".
 *
 * @param path - Resolved asset path (namespace/type/filename), e.g. `'game/font/fezbox.otf'`.
 * @throws If the fetch response is not `ok`.
 */
export const defaultResolve = async (path: string): Promise<Blob> => {
  const response = await fetch('/' + path);
  if (!response.ok) throw new Error(`loadAsset: fetch failed for "${path}" (${response.status})`);
  return response.blob();
};
