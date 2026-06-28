import type { Plugin, OutputAsset } from 'vite'

// Minifies *.webmanifest files in the build output — they're plain JSON so
// JSON.parse/stringify strips all whitespace with zero extra dependencies.
export default function minifyManifestPlugin(): Plugin {
  return {
    name:  'vite-minify-manifest-plugin',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const [name, asset] of Object.entries(bundle)) {
        if (!name.endsWith('.webmanifest')) continue
        ;(asset as OutputAsset).source = JSON.stringify(JSON.parse((asset as OutputAsset).source as string))
      }
    },
  }
}
