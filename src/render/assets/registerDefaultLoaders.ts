/**
 * Single entry point: importing this module (side effect only) registers the 4 default loaders
 * against the registry. Import once at render worker startup (see `src/render/render.worker.ts`).
 */
import './loaders/MeshLoader'
import './loaders/TextureLoader'
import './loaders/AudioLoader'
import './loaders/FontLoader'
