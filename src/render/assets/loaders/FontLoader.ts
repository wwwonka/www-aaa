import { registerLoader } from '../registry'
import type { IResourceLoader } from '../types'

/**
 * Loads a font file into a ready `FontFace`. `FontFace` itself is available in a worker, but
 * `document.fonts.add()` — the step that actually makes the font usable for text rendering — is
 * not: there's no `document` in an OffscreenCanvas worker. This loader only resolves a loaded
 * `FontFace`; registering it against the active font set is left to the caller, on the main
 * thread, out of scope for this module.
 */
const fontLoader: IResourceLoader<FontFace> = {
  async parse(blob, path) {
    const name = path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'))
    const font = new FontFace(name, await blob.arrayBuffer())
    return font.load()
  },
}

registerLoader(['otf', 'ttf', 'woff', 'woff2'], fontLoader)
