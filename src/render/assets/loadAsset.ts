import type { Scene, AbstractMesh, Texture } from '@babylonjs/core/pure'
import { getLoader, defaultResolve } from './registry'
import type { LoaderContext } from './types'
import type { AnimationTrack } from './loaders/AnimationLoader'

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

async function loadAssetUncached<T>(path: string, ctx: LoaderContext): Promise<T> {
  const ext = extensionOf(path)
  const loader = getLoader(ext)
  if (!loader) throw new Error(`loadAsset: no loader registered for extension ".${ext}" (${path})`)
  const blob = await (loader.resolve ?? defaultResolve)(path)
  return loader.parse(blob, path, ctx) as Promise<T>
}

/**
 * Single entry point to load any asset type, dispatching by file extension to the loader
 * registered via `registerLoader` (see `registry.ts`). Dedupes concurrent calls for the same
 * `path` through {@link inFlight} — two systems requesting the same mesh before either resolves
 * get back the exact same Promise, avoiding redundant fetch/parse work and race conditions.
 *
 * Resolved entries stay cached forever (re-parsing a glTF isn't free, and callers expect the same
 * instance back); rejected entries are evicted so a transient failure doesn't permanently poison
 * the cache.
 */
export function loadAsset<T>(rawPath: string, ctx: LoaderContext = {}): Promise<T> {
  const path = normalizePath(rawPath)
  const cached = inFlight.get(path)
  if (cached) {
    console.debug(`[loadAsset] cache hit: ${path}`)
    return cached as Promise<T>
  }
  console.debug(`[loadAsset] cache miss: ${path}`)
  const promise = loadAssetUncached<T>(path, ctx).catch(err => { inFlight.delete(path); throw err })
  inFlight.set(path, promise)
  return promise
}

/** Loads a glTF/GLB mesh — thin wrapper over {@link loadAsset} that makes `scene` mandatory at the type level. */
export function loadMesh(path: string, scene: Scene): Promise<{ meshes: AbstractMesh[] }> {
  return loadAsset(path, { scene })
}

/** Loads a Babylon `Texture` — thin wrapper over {@link loadAsset} that makes `scene` mandatory at the type level. */
export function loadTexture(path: string, scene: Scene): Promise<Texture> {
  return loadAsset(path, { scene })
}

/** Loads and decodes a font file into a ready `FontFace` — thin wrapper over {@link loadAsset}. */
export function loadFont(path: string): Promise<FontFace> {
  return loadAsset(path)
}

/** Loads and decodes an audio file into an `AudioBuffer` — thin wrapper over {@link loadAsset}. */
export function loadAudio(path: string): Promise<AudioBuffer> {
  return loadAsset(path)
}

/** Loads a baked `.anim` track (see `loaders/AnimationLoader.ts`) — thin wrapper over {@link loadAsset}. */
export function loadAnimation(path: string): Promise<AnimationTrack> {
  return loadAsset(path)
}

/**
 * Loads a batch of assets in parallel (`Promise.all`, not sequential) and returns them keyed the
 * same way as the input `paths` map — convenient for preloading a "pack" of assets for a screen or
 * level in one call.
 */
export function loadAssets<T extends Record<string, string>>(
  paths: T,
  scene?: Scene,
): Promise<{ [K in keyof T]: unknown }> {
  const entries = Object.entries(paths) as [keyof T, string][]
  return Promise.all(entries.map(([key, path]) => loadAsset(path, { scene }).then(value => [key, value] as const)))
    .then(results => Object.fromEntries(results) as { [K in keyof T]: unknown })
}
