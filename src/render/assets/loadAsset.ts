import type { Scene, AbstractMesh, Texture } from '@babylonjs/core/pure'
import { getLoaderEntry, defaultResolve } from './registry'
import type { LoaderContext } from './types'
import type { AnimationTrackSet } from './loaders/AnimationLoader'
import { assetPath } from '../../core/assetPath'
import type { AssetNamespace } from '../../../_dev/vite-asset-manifest-plugin'

const inFlight = new Map<string, Promise<unknown>>()

/**
 * Normalizes an asset path to lowercase — single source of truth for path casing, so `'Boid.glb'`
 * and `'boid.glb'` always dedupe to the same {@link inFlight} entry instead of triggering two
 * independent loads.
 */
function normalizePath(path: string): string {
  return path.toLowerCase()
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  if (dot === -1) throw new Error(`loadAsset: cannot determine extension for "${path}"`)
  return path.slice(dot + 1)
}

async function loadAssetUncached<T>(path: string, ctx: LoaderContext, entry: NonNullable<ReturnType<typeof getLoaderEntry>>): Promise<T> {
  const blob = await (entry.loader.resolve ?? defaultResolve)(path)
  return entry.loader.parse(blob, path, ctx) as Promise<T>
}

/**
 * Single entry point to load any asset type. Takes a bare filename (`'fezbox.otf'`) — the
 * extension picks the loader (see `registerLoader` in `registry.ts`), and the loader's registered
 * `type` (its folder under `public/<namespace>/`) resolves the full path automatically via
 * `assetPath()`, so call sites never build a path by hand. Dedupes concurrent calls for the same
 * resolved path through {@link inFlight} — two systems requesting the same mesh before either
 * resolves get back the exact same Promise, avoiding redundant fetch/parse work and race conditions.
 *
 * Resolved entries stay cached forever (re-parsing a glTF isn't free, and callers expect the same
 * instance back); rejected entries are evicted so a transient failure doesn't permanently poison
 * the cache.
 */
export function loadAsset<T>(filename: string, ctx: LoaderContext = {}, namespace: AssetNamespace = 'game'): Promise<T> {
  const ext   = extensionOf(filename)
  const entry = getLoaderEntry(ext)
  if (!entry) throw new Error(`loadAsset: no loader registered for extension ".${ext}" (${filename})`)

  const path = normalizePath(assetPath(namespace, entry.type, filename))
  const cached = inFlight.get(path)
  if (cached) {
    console.debug(`[loadAsset] cache hit: ${path}`)
    return cached as Promise<T>
  }
  console.debug(`[loadAsset] cache miss: ${path}`)
  const promise = loadAssetUncached<T>(path, ctx, entry).catch(err => { inFlight.delete(path); throw err })
  inFlight.set(path, promise)
  return promise
}

/** Loads a glTF/GLB mesh — thin wrapper over {@link loadAsset} that makes `scene` mandatory at the type level. */
export function loadMesh(filename: string, scene: Scene): Promise<{ meshes: AbstractMesh[] }> {
  return loadAsset(filename, { scene })
}

/** Loads a Babylon `Texture` — thin wrapper over {@link loadAsset} that makes `scene` mandatory at the type level. */
export function loadTexture(filename: string, scene: Scene): Promise<Texture> {
  return loadAsset(filename, { scene })
}

/** Loads and decodes a font file into a ready `FontFace` — thin wrapper over {@link loadAsset}. */
export function loadFont(filename: string): Promise<FontFace> {
  return loadAsset(filename)
}

/** Loads and decodes an audio file into an `AudioBuffer` — thin wrapper over {@link loadAsset}. */
export function loadAudio(filename: string): Promise<AudioBuffer> {
  return loadAsset(filename)
}

/** Loads a baked animation file (`.anim` binary in prod, `.anim.json` in dev) — thin wrapper over {@link loadAsset}. */
export function loadAnimation(filename: string): Promise<AnimationTrackSet> {
  return loadAsset(filename)
}

/**
 * Loads a batch of assets in parallel (`Promise.all`, not sequential) and returns them keyed the
 * same way as the input `filenames` map — convenient for preloading a "pack" of assets for a
 * screen or level in one call.
 */
export function loadAssets<T extends Record<string, string>>(
  filenames: T,
  scene?: Scene,
): Promise<{ [K in keyof T]: unknown }> {
  const entries = Object.entries(filenames) as [keyof T, string][]
  return Promise.all(entries.map(([key, filename]) => loadAsset(filename, { scene }).then(value => [key, value] as const)))
    .then(results => Object.fromEntries(results) as { [K in keyof T]: unknown })
}
