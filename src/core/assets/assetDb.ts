/**
 * Native IndexedDB wrapper for cached game assets. No npm dependency — the API surface
 * needed here (one store, get/put by key, query by namespace/type) doesn't justify pulling one in.
 *
 * Importable from the main thread, a dedicated Worker, or the Service Worker — IndexedDB
 * is available in all three, and {@link AssetsManager} and the Service Worker both read/write
 * the same database independently of which thread populated it.
 */

import type { AssetNamespace } from '../../../_dev/vite-asset-manifest-plugin';

const DB_NAME = 'AssetsDB';
const DB_VERSION = 3;
const STORE_NAME = 'assets';

const NAMESPACE_INDEX = 'namespace';
const TYPE_INDEX = 'type';

export interface CachedAsset {
  path: string;
  namespace: AssetNamespace;
  type: string;
  hash: string;
  size: number;
  cachedAt: number;
  blob: Blob;
}

export function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : request.result.createObjectStore(STORE_NAME, { keyPath: 'path' });
      if (!store.indexNames.contains(NAMESPACE_INDEX))
        store.createIndex(NAMESPACE_INDEX, 'namespace');
      if (!store.indexNames.contains(TYPE_INDEX)) store.createIndex(TYPE_INDEX, 'type');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function getAsset(db: IDBDatabase, path: string): Promise<CachedAsset | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(path);
    request.onsuccess = () => resolve(request.result as CachedAsset | undefined);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Lists every cached asset belonging to one namespace — used to drive granular warm-up (app first, game next). */
export function getAssetsByNamespace(
  db: IDBDatabase,
  namespace: AssetNamespace,
): Promise<CachedAsset[]> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .index(NAMESPACE_INDEX)
      .getAll(namespace);
    request.onsuccess = () => resolve(request.result as CachedAsset[]);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Lists every cached asset of one type (e.g. 'font', 'mesh') across namespaces. */
export function getAssetsByType(db: IDBDatabase, type: string): Promise<CachedAsset[]> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .index(TYPE_INDEX)
      .getAll(type);
    request.onsuccess = () => resolve(request.result as CachedAsset[]);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function putAsset(db: IDBDatabase, asset: CachedAsset): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(asset);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}
