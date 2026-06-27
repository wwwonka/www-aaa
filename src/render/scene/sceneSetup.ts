import { Engine, MeshBuilder, Scene, StandardMaterial, Color3 } from '@babylonjs/core'
import { createCamera } from './camera'
import { createLights } from './lights'

export function sceneSetup(engine: Engine, scene: Scene): void {
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

  // OffscreenCanvas n'a pas accès à window — le main thread envoie un message 'resize'
  // plutôt que window.addEventListener('resize')
  self.addEventListener('message', (e) => {
    if (e.data?.type === 'resize') engine.resize()
  })
}
