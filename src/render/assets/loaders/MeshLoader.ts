import { SceneLoader, Mesh } from '@babylonjs/core/pure'
import '@babylonjs/loaders/glTF'
import { registerLoader } from '../registry'
import type { IResourceLoader } from '../types'
import type { AbstractMesh } from '@babylonjs/core/pure'

/** Loads glTF/GLB meshes into the given {@link import('../types').LoaderContext.scene}. */
const meshLoader: IResourceLoader<{ meshes: AbstractMesh[] }> = {
  async parse(blob, path, ctx) {
    if (!ctx.scene) throw new Error(`loadAsset: mesh loader requires ctx.scene for "${path}"`)
    const url = URL.createObjectURL(blob)
    try {
      const ext = '.' + path.slice(path.lastIndexOf('.') + 1)
      const result = await SceneLoader.ImportMeshAsync('', '', url, ctx.scene, undefined, ext)
      // Post-load init — the asset must be Game-Ready by the time parse() resolves.
      result.meshes.forEach(m => { if (m instanceof Mesh) m.bakeCurrentTransformIntoVertices() })
      return { meshes: result.meshes }
    } finally {
      URL.revokeObjectURL(url)
    }
  },
}

registerLoader(['glb', 'gltf'], meshLoader)
