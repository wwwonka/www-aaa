/// <reference lib="webworker" />
import { openAssetDb, getAsset } from '../../core/assetDb';
import { assetPath } from '../../core/assetPath';
import type { AssetManifest } from '../../../_dev/vite-asset-manifest-plugin';

let knownPaths: Set<string> = new Set();
let dbPromise: Promise<IDBDatabase> | undefined;

/**
 * Loads the build manifest into memory so {@link handleAssetFetch} can decide synchronously
 * whether a request is a known static asset, without an IDB round-trip on every fetch.
 * Called once at SW `activate` — mirrors `restoreTransparentFaviconPref`'s startup restore.
 */
export async function loadAssetManifest(): Promise<void> {
  try {
    const manifest = (await fetch('/assets.json').then((r) => r.json())) as AssetManifest;
    knownPaths = new Set(
      Object.entries(manifest).flatMap(([namespace, types]) =>
        Object.entries(types).flatMap(([type, files]) =>
          Object.keys(files).map((filename) => assetPath(namespace, type, filename)),
        ),
      ),
    );
  } catch {
    knownPaths = new Set();
  }
}

/**
 * IndexedDB-first proxy for any request whose path is in the asset manifest — AssetsManager
 * populates this same store from the main thread during warm-up; the SW just reads it back so
 * Babylon/PixiJS can keep doing plain `fetch()` with no cache-awareness. Anything not in the
 * manifest falls through untouched.
 */
export function handleAssetFetch(event: FetchEvent): boolean {
  const path = new URL(event.request.url).pathname.replace(/^\//, '');
  if (!knownPaths.has(path)) return false;

  dbPromise ??= openAssetDb();

  event.respondWith(
    dbPromise
      .then((db) => getAsset(db, path))
      .then((cached) => (cached ? new Response(cached.blob) : fetch(event.request)))
      .catch(() => fetch(event.request)),
  );
  return true;
}
