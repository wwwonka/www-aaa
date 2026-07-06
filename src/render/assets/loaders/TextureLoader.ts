import { Texture } from '@babylonjs/core/pure'
import { registerLoader } from '../registry'
import type { IResourceLoader } from '../types'

/**
 * Loads image formats into a Babylon `Texture` for the given scene. 3D scene textures only for
 * now — no UI image asset exists in the manifest yet. Add a Pixi variant (`Texture.from`) the day
 * a first UI image asset appears (YAGNI).
 */
const textureLoader: IResourceLoader<Texture> = {
  async parse(blob, path, ctx) {
    if (!ctx.scene) throw new Error(`loadAsset: texture loader requires ctx.scene for "${path}"`)
    const url = URL.createObjectURL(blob)
    return new Promise<Texture>((resolve, reject) => {
      const texture = new Texture(
        url,
        ctx.scene,
        undefined,
        undefined,
        undefined,
        () => { URL.revokeObjectURL(url); resolve(texture) },
        (message) => { URL.revokeObjectURL(url); reject(new Error(`loadAsset: texture parse failed for "${path}": ${message}`)) },
      )
    })
  },
}

registerLoader(['png', 'jpg', 'jpeg', 'webp'], 'texture', textureLoader)
