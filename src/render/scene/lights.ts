import { Scene, HemisphericLight, Vector3 } from '@babylonjs/core/pure'

/** Creates the scene's ambient hemispheric light, shining from straight above. */
export function createLights(scene: Scene): HemisphericLight {
  const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
  light.intensity = 0.7
  return light
}
