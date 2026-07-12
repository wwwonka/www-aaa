// Rend les boids en thin instances (une seule draw call pour N boids) depuis les matrices
// monde écrites par la sim (SAB). Placeholder low-poly volontaire — mesh custom à l'étape 7.
import { Scene, CreateCylinder, StandardMaterial, Color3 } from '@babylonjs/core/pure';
import { BOID_RADIUS } from '../../shared/config';
import { SAB_BOID_STRIDE } from '../../shared/constants';

export interface BoidsRenderer {
  /** Recopie les matrices sim de la frame et pousse le buffer aux thin instances. */
  update(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

/**
 * @param boidMatrices - Vue Float32 sur la section MATRICES du SAB (16 floats par boid).
 * WebGL n'accepte pas de vue adossée à un SharedArrayBuffer pour l'upload : on recopie
 * chaque frame dans un buffer local (24 × 16 floats — négligeable), ce qui découple aussi
 * le rendu d'un éventuel tearing d'écriture (policy latest-wins, étape 4).
 */
export function createBoidsRenderer(scene: Scene, boidMatrices: Float32Array): BoidsRenderer {
  const boidCount = boidMatrices.length / SAB_BOID_STRIDE;

  const mesh = CreateCylinder(
    'boid',
    { diameterTop: 0, diameterBottom: BOID_RADIUS * 2, height: BOID_RADIUS * 2.4, tessellation: 8 },
    scene,
  );
  // Le cône pointe vers +Y à la création ; on le couche vers +Z (le forward des matrices sim).
  mesh.rotation.x = Math.PI / 2;
  mesh.bakeCurrentTransformIntoVertices();

  const material = new StandardMaterial('boidMat', scene);
  material.diffuseColor = new Color3(1.0, 0.65, 0.15);
  material.emissiveColor = new Color3(0.25, 0.12, 0.02);
  mesh.material = material;

  const uploadBuffer = new Float32Array(boidCount * SAB_BOID_STRIDE);
  uploadBuffer.set(boidMatrices);
  // staticBuffer=false : le buffer est re-poussé chaque frame.
  mesh.thinInstanceSetBuffer('matrix', uploadBuffer, SAB_BOID_STRIDE, false);

  return {
    update(): void {
      uploadBuffer.set(boidMatrices);
      mesh.thinInstanceBufferUpdated('matrix');
    },
    setVisible(visible: boolean): void {
      mesh.setEnabled(visible);
    },
    dispose(): void {
      mesh.dispose();
      material.dispose();
    },
  };
}
