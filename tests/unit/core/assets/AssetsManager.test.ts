// Golden test for a real regression (2026-07-20) : `warmUp()` used to delete a critical asset's
// path from `pendingCritical` even when its fetch failed, so `criticalReady` resolved as if the
// flash-free guarantee held. This locks the fixed contract in place: `criticalReady` must stay
// pending across a failed critical fetch and only resolve once every critical asset is truly cached.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssetManifest } from '../../../../_dev/vite-asset-manifest-plugin';

const dbState = new Map<string, unknown>();

vi.mock('../../../../src/core/assets/assetDb', () => ({
  openAssetDb: vi.fn().mockResolvedValue({}),
  getAsset: vi.fn((_db: unknown, path: string) => Promise.resolve(dbState.get(path))),
  putAsset: vi.fn((_db: unknown, asset: { path: string }) => {
    dbState.set(asset.path, asset);
    return Promise.resolve();
  }),
}));

const manifest: AssetManifest = {
  app: { font: { 'fezbox.otf': { hash: 'h1', size: 10 } } },
  game: {},
};

/** Bounded race against an already-resolved sentinel — the only way to assert "not yet settled"
 * without an arbitrary sleep. Both race arms must be exactly one `.then()` hop deep (per the
 * `Promise.race` spec) so a promise settled synchronously earlier in the same microtask
 * checkpoint reliably wins, instead of an accidental extra hop making it look still-pending. */
async function isSettled(p: Promise<unknown>): Promise<boolean> {
  const sentinel = Symbol('pending');
  const result = await Promise.race([p, Promise.resolve(sentinel)]);
  return result !== sentinel;
}

describe('AssetsManager.criticalReady — resolves only when every critical asset is actually cached', () => {
  beforeEach(() => {
    dbState.clear();
    vi.resetModules();
  });

  it('stays pending after a failed critical-asset fetch (does not lie about readiness)', async () => {
    const { createAssetsManager } = await import('../../../../src/core/assets/AssetsManager');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/assets.json') {
          return Promise.resolve({ json: () => Promise.resolve(manifest) } as Response);
        }
        return Promise.reject(new Error('network down'));
      }),
    );

    const manager = createAssetsManager();
    await manager.warmUp(undefined, () => {});

    expect(await isSettled(manager.criticalReady)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('resolves once the critical asset succeeds (including on a later retry warmUp)', async () => {
    const { createAssetsManager } = await import('../../../../src/core/assets/AssetsManager');
    let shouldFail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/assets.json') {
          return Promise.resolve({ json: () => Promise.resolve(manifest) } as Response);
        }
        if (shouldFail) return Promise.reject(new Error('network down'));
        return Promise.resolve({ blob: () => Promise.resolve(new Blob()) } as Response);
      }),
    );

    const manager = createAssetsManager();
    await manager.warmUp(undefined, () => {});
    expect(await isSettled(manager.criticalReady)).toBe(false);

    shouldFail = false;
    await manager.warmUp(undefined, () => {}); // retry (e.g. next namespace warm-up) — now succeeds
    expect(await isSettled(manager.criticalReady)).toBe(true);
    vi.unstubAllGlobals();
  });
});
