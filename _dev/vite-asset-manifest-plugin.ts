import type { Plugin, ResolvedConfig }                  from 'vite'
import { createHash }                                   from 'crypto'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { resolve, join, relative }                      from 'path'

export type AssetNamespace = 'app' | 'game'

interface AssetMeta {
  hash: string
  size: number
}

/**
 * `{ app: { icon: { 'favicon.svg': {hash,size} }, splash: {...}, misc: {...} }, game: { font: {...} } }`
 * Mirrors `public/<namespace>/<type>/<file>` exactly — namespace and type are structural (object
 * keys), never repeated as values, so the manifest stays small as the asset count grows.
 */
export type AssetManifest = Record<AssetNamespace, Record<string, Record<string, AssetMeta>>>

const MANIFEST_FILENAME = 'assets.json'
const NAMESPACES: AssetNamespace[] = ['app', 'game']
const MISC_TYPE = 'misc'

function listFiles(dir: string, root: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue // skip dotfiles (.DS_Store, etc.)
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) results.push(...listFiles(full, root))
    else results.push(relative(root, full))
  }
  return results
}

function buildManifest(publicDir: string, warn: (msg: string) => void): AssetManifest {
  for (const entry of readdirSync(publicDir)) {
    if (entry.startsWith('.') || entry === MANIFEST_FILENAME) continue
    if (!NAMESPACES.includes(entry as AssetNamespace)) {
      warn(`public/${entry} est hors app/ et game/ — il ne sera pas suivi par AssetsManager`)
    }
  }

  const manifest = { app: {}, game: {} } as AssetManifest

  for (const namespace of NAMESPACES) {
    const namespaceDir = join(publicDir, namespace)
    if (!existsSync(namespaceDir)) continue

    for (const relPath of listFiles(namespaceDir, namespaceDir)) {
      const segments = relPath.split('/')
      const type     = segments.length > 1 ? segments[0] : MISC_TYPE
      const filename = segments.length > 1 ? segments.slice(1).join('/') : segments[0]
      const bytes    = readFileSync(join(namespaceDir, relPath))

      manifest[namespace][type] ??= {}
      manifest[namespace][type][filename] = {
        hash: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
        size: bytes.length,
      }
    }
  }

  return manifest
}

/**
 * Hashes the content of `public/app/` and `public/game/` — namespace/type are derived from folder
 * structure (singular-named subdirectories, e.g. `font/`, `icon/`, `splash/`), then shaped into the
 * nested {@link AssetManifest} so AssetsManager/the Service Worker never repeat namespace/type as
 * JSON values.
 *
 * Dev: served from memory via a dedicated middleware — Vite's public-dir static serving only
 * picks up files that existed at server start, so writing the manifest to disk and hoping it
 * gets served falls back to the SPA shell (wrong content-type, 404 in disguise).
 * Build: written to `public/` at `buildStart` so Vite's own `copyPublicDir` step ships it in `dist/`.
 */
export default function assetManifestPlugin(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'vite-asset-manifest-plugin',
    configResolved(c) { config = c },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== `/${MANIFEST_FILENAME}`) return next()
        const manifest = buildManifest(resolve(config.root, 'public'), msg => server.config.logger.warn(msg))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(manifest, null, 2))
      })
    },
    buildStart() {
      if (config.command !== 'build') return
      const publicDir = resolve(config.root, 'public')
      if (!existsSync(publicDir)) return

      const manifest = buildManifest(publicDir, msg => this.warn(msg))
      writeFileSync(join(publicDir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2))
    },
  }
}
