import { Scene, UniversalCamera, Vector3 } from '@babylonjs/core/pure'

/** Creates the scene's main camera, positioned on +Z and looking at the origin. */
export function createCamera(scene: Scene): UniversalCamera {
  const camera = new UniversalCamera('camera', new Vector3(0, 0, 15), scene)
  camera.setTarget(Vector3.Zero())
  return camera
}
