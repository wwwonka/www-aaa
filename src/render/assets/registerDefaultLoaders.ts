/**
 * Single entry point: importing this module (side effect only) registers the default loaders
 * against the registry. Import once at render worker startup (see `src/render/render.worker.ts`).
 */
import './loaders/MeshLoader';
import './loaders/TextureLoader';
import './loaders/AudioLoader';
import './loaders/FontLoader';
import './loaders/AnimationLoader'; // .anim binaire — toujours enregistré (fallback dev + prod)

// .json — dev only, jamais présent dans le bundle prod (import.meta.env.DEV est une constante
// statiquement remplacée par Vite ; cette branche entière est éliminée au build). Ce module reste
// la seule ligne de tout `src/render/**` à référencer `_dev/` — le reste du Worker ignore
// totalement l'existence du format JSON.
export const devLoadersReady: Promise<void> = import.meta.env.DEV
  ? import('../../_dev/assets/JsonAnimationLoader').then(() => {})
  : Promise.resolve();
