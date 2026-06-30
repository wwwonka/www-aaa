import { Engine, Scene, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core/pure'
import { createCamera } from './camera'
import { createLights }  from './lights'

export function sceneSetup(_engine: Engine, scene: Scene): void {
  createCamera(scene)
  createLights(scene)

  // Cube temporaire — validation du rendu OffscreenCanvas, à retirer
  const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
  const mat = new StandardMaterial('mat', scene)
  mat.diffuseColor = new Color3(0.4, 0.6, 1)
  box.material = mat
  scene.onBeforeRenderObservable.add(() => {
    box.rotation.y += 0.01
  })
}
