// Scène de jeu : arène (sol), props poussables synchronisés sur la physique, marqueur de
// cible (debug), et cadrage caméra. Meshes simples pour l'étape 3 — assets custom à l'étape 7.
import {
  Scene,
  Mesh,
  Matrix,
  Quaternion,
  Vector3,
  CreateBox,
  CreateGround,
  CreateSphere,
  StandardMaterial,
  Color3,
  UniversalCamera,
} from '@babylonjs/core/pure';
import { ARENA_HALF_EXTENT, PROP_DEFS } from '../../shared/config';
import { SAB_BOID_STRIDE } from '../../shared/constants';
import { createBoidsRenderer } from './BoidsRenderer';

export interface GameScene {
  /** Synchronise meshes et thin instances depuis les matrices écrites par la sim. */
  update(): void;
  /** Affiche/masque toute la scène de jeu et bascule le cadrage caméra. */
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface GameSceneBuffers {
  readonly boidMatrices: Float32Array;
  readonly propMatrices: Float32Array;
  readonly targetPosition: Float32Array;
}

const GAME_CAMERA_POSITION = new Vector3(0, 18, -20);

// Scratch de synchro — réutilisés chaque frame, jamais alloués en boucle.
const tmpMatrix = new Matrix();
const tmpScale = new Vector3();

export function createGameScene(scene: Scene, buffers: GameSceneBuffers): GameScene {
  const meshes: Mesh[] = [];

  const ground = CreateGround(
    'arena',
    { width: ARENA_HALF_EXTENT * 2, height: ARENA_HALF_EXTENT * 2 },
    scene,
  );
  const groundMat = new StandardMaterial('arenaMat', scene);
  groundMat.diffuseColor = new Color3(0.16, 0.2, 0.28);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;
  meshes.push(ground);

  const propMat = new StandardMaterial('propMat', scene);
  propMat.diffuseColor = new Color3(0.55, 0.35, 0.75);
  const props: Mesh[] = PROP_DEFS.map((def, i) => {
    const box = CreateBox(
      `prop${i}`,
      { width: def.halfExtents[0] * 2, height: def.halfExtents[1] * 2, depth: def.halfExtents[2] * 2 },
      scene,
    );
    box.material = propMat;
    box.rotationQuaternion = new Quaternion();
    meshes.push(box);
    return box;
  });

  // Marqueur de la sphère de contrôle — "invisible" côté produit, semi-transparent pour le dev.
  const targetMarker = CreateSphere('controlTarget', { diameter: 0.8, segments: 12 }, scene);
  const targetMat = new StandardMaterial('controlTargetMat', scene);
  targetMat.diffuseColor = new Color3(0.2, 0.9, 0.9);
  targetMat.alpha = 0.35;
  targetMarker.material = targetMat;
  meshes.push(targetMarker);

  const boids = createBoidsRenderer(scene, buffers.boidMatrices);

  const camera = scene.activeCamera as UniversalCamera | null;
  const titleCameraPosition = camera ? camera.position.clone() : null;

  const setVisible = (visible: boolean): void => {
    for (const m of meshes) m.setEnabled(visible);
    boids.setVisible(visible);
    if (!camera) return;
    if (visible) {
      camera.position.copyFrom(GAME_CAMERA_POSITION);
    } else if (titleCameraPosition) {
      camera.position.copyFrom(titleCameraPosition);
    }
    camera.setTarget(Vector3.Zero());
  };
  setVisible(false);

  return {
    update(): void {
      boids.update();
      for (let i = 0; i < props.length; i++) {
        Matrix.FromArrayToRef(buffers.propMatrices, i * SAB_BOID_STRIDE, tmpMatrix);
        tmpMatrix.decompose(tmpScale, props[i].rotationQuaternion!, props[i].position);
      }
      targetMarker.position.set(
        buffers.targetPosition[0],
        buffers.targetPosition[1] + 0.4,
        buffers.targetPosition[2],
      );
    },
    setVisible,
    dispose(): void {
      boids.dispose();
      for (const m of meshes) m.dispose();
      groundMat.dispose();
      propMat.dispose();
      targetMat.dispose();
    },
  };
}
