import { openAssetDb, getAsset, putAsset } from './assetDb';
import { assetPath } from './assetPath';
import type { AssetNamespace, AssetManifest } from '../../../_dev/vite-asset-manifest-plugin';
import type { SystemLifecycle } from '../systems/SystemLifecycle';

interface FlatEntry {
  path: string;
  namespace: AssetNamespace;
  type: string;
  hash: string;
  size: number;
}

// Assets needed before first paint to avoid a flash of unstyled content (fonts today).
// Always pulled into every warmUp() call regardless of requested namespace, so the
// flash-free guarantee holds no matter which namespace a critical type happens to live in.
const CRITICAL_TYPE = 'font';

function flatten(manifest: AssetManifest, namespace?: AssetNamespace): FlatEntry[] {
  const namespaces = namespace ? [namespace] : (Object.keys(manifest) as AssetNamespace[]);
  return namespaces.flatMap((ns) =>
    Object.entries(manifest[ns] ?? {}).flatMap(([type, files]) =>
      Object.entries(files).map(([filename, meta]) => ({
        path: assetPath(ns, type, filename),
        namespace: ns,
        type,
        ...meta,
      })),
    ),
  );
}

export type AssetLoadEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; path: string; loaded: number; total: number }
  | { type: 'complete' }
  | { type: 'error'; path: string; error: string };

export interface AssetsManagerApi extends SystemLifecycle {
  /**
   * Fetches the build manifest, diffs it against what's already cached in IndexedDB by
   * content hash, and downloads anything missing or stale. Reports progress via `onEvent`;
   * the Service Worker then serves cached entries transparently on `fetch`.
   *
   * Pass a `namespace` to warm up only `app` (menu/shell) or `game` (simulation) assets —
   * lets AppOrchestrator sequence loading (app first, game once play actually starts).
   * Omit it to warm up everything. Critical assets (see {@link criticalReady}) are always
   * included regardless of the requested namespace, so the flash-free guarantee holds
   * no matter which namespace they happen to live in.
   */
  warmUp(
    namespace: AssetNamespace | undefined,
    onEvent: (event: AssetLoadEvent) => void,
  ): Promise<void>;
  /** Resolves once every critical asset (fonts) is cached — await before first text render to avoid a flash. */
  readonly criticalReady: Promise<void>;
  /** Requests durable storage so the OS doesn't evict IndexedDB under pressure. */
  persist(): Promise<boolean>;
  /**
   * {@link SystemLifecycle} entry point — thin alias over `warmUp(undefined, onEvent)`, used by
   * `AppOrchestrator` once it has obtained the instance from `SystemHost.worker.ts`'s `get(id)`
   * (or the inline factory, depending on `SystemAllocator`'s decision).
   *
   * @param onEvent - optional progress callback, defaults to a no-op
   * @see docs/architecture/system-allocator.md
   */
  startUp(onEvent?: (event: AssetLoadEvent) => void): Promise<void>;
  /** No-op today — AssetsManager holds no open connection/timer to release. Kept honest with {@link SystemLifecycle}. */
  shutDown(): Promise<void>;
}

/**
 * Creates an AssetsManager bound to the calling thread. Every method here already
 * returns a Promise, so this same `AssetsManagerApi` shape stays valid if a manager is
 * later run inside a dedicated Worker and exposed via `Comlink.expose`/`Comlink.wrap` —
 * call-sites don't change, only how the instance is constructed.
 */
export function createAssetsManager(): AssetsManagerApi {
  let manifestPromise: Promise<AssetManifest> | undefined;
  const fetchManifest = (): Promise<AssetManifest> =>
    (manifestPromise ??= fetch('/assets.json').then((r) => r.json()));

  let resolveCriticalReady!: () => void;
  const criticalReady = new Promise<void>((resolve) => {
    resolveCriticalReady = resolve;
  });
  let pendingCritical: Set<string> | undefined;

  async function warmUp(
    namespace: AssetNamespace | undefined,
    onEvent: (event: AssetLoadEvent) => void,
  ): Promise<void> {
    const manifest = await fetchManifest();
    pendingCritical ??= new Set(
      flatten(manifest)
        .filter((e) => e.type === CRITICAL_TYPE)
        .map((e) => e.path),
    );
    const pendingSet = pendingCritical;

    const requested = flatten(manifest, namespace);
    const critical = flatten(manifest).filter(
      (e) => e.type === CRITICAL_TYPE && !requested.some((r) => r.path === e.path),
    );
    const toLoad = [...requested, ...critical];

    const db = await openAssetDb();

    onEvent({ type: 'start', total: toLoad.length });

    let completed = 0;
    await Promise.all(
      toLoad.map(async (entry) => {
        try {
          const cached = await getAsset(db, entry.path);
          if (cached?.hash !== entry.hash) {
            const blob = await fetch(`/${entry.path}`).then((r) => r.blob());
            await putAsset(db, {
              path: entry.path,
              namespace: entry.namespace,
              type: entry.type,
              hash: entry.hash,
              size: entry.size,
              cachedAt: Date.now(),
              blob,
            });
          }
          completed++;
          onEvent({ type: 'progress', path: entry.path, loaded: completed, total: toLoad.length });
          // Retiré du pending seulement sur succès : `criticalReady` ne doit résoudre que quand
          // TOUS les assets critiques sont réellement en cache — un échec laisse son path en
          // attente (pas de faux « ready »), voir le contrat documenté sur {@link criticalReady}.
          pendingSet.delete(entry.path);
        } catch (error) {
          onEvent({ type: 'error', path: entry.path, error: String(error) });
        }
      }),
    );

    if (pendingSet.size === 0) resolveCriticalReady();
    onEvent({ type: 'complete' });
  }

  async function persist(): Promise<boolean> {
    if (!navigator.storage?.persist) return false;
    return navigator.storage.persist();
  }

  const startUp = (onEvent: (event: AssetLoadEvent) => void = () => {}): Promise<void> =>
    warmUp(undefined, onEvent);

  const shutDown = async (): Promise<void> => {};

  return { warmUp, criticalReady, persist, startUp, shutDown };
}
