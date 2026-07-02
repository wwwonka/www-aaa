import { Scene, UniversalCamera, Vector3 } from '@babylonjs/core/pure'

export function createCamera(scene: Scene): UniversalCamera {
  const camera = new UniversalCamera('camera', new Vector3(0, 0, 15), scene)
  camera.setTarget(Vector3.Zero())
  return camera
}
