import { Engine, Scene} from '@babylonjs/core/pure'
import { createCamera } from './camera'
import { createLights }  from './lights'
import { loadMesh }      from '../assets/loadAsset'

export async function sceneSetup(_engine: Engine, scene: Scene): Promise<void> {
  createCamera(scene)
  createLights(scene)

  // Cube temporaire — validation du rendu OffscreenCanvas, à retirer
  // const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
  // const mat = new StandardMaterial('mat', scene)
  // mat.diffuseColor = new Color3(0.4, 0.6, 1)
  // box.material = mat
  // scene.onBeforeRenderObservable.add(() => {
  //   box.rotation.y += 0.01
  // })

  const { meshes } = await loadMesh('shiny_fish.glb', scene)
  const root = meshes[0]
  root.position.set(0, -2.4, 0)
  scene.onBeforeRenderObservable.add(() => {
    root.rotation.y += 0.01
  })
}
