import { Engine, Scene, AbstractMesh } from '@babylonjs/core/pure';
import { createCamera } from './camera';
import { createLights } from './lights';
import { loadMesh } from '../assets/loadAsset';

export interface SceneHandles {
  /** Racine du mesh d'attract du Title Screen — masquée pendant le jeu. */
  readonly titleRoot: AbstractMesh;
}

/** One-time 3D scene bootstrap — camera, lights, and the demo mesh. Called once by `RenderManager.init()`. */
export async function sceneSetup(_engine: Engine, scene: Scene): Promise<SceneHandles> {
  createCamera(scene);
  createLights(scene);

  const { meshes } = await loadMesh('shiny_fish.glb', scene);
  const root = meshes[0];
  root.position.set(0, -2.4, 0);
  scene.onBeforeRenderObservable.add(() => {
    root.rotation.y += 0.01;
  });
  return { titleRoot: root };
}
