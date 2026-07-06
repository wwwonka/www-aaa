// Allocates and slices the SharedArrayBuffer for all workers
import { SAB_BOID_STRIDE } from '../shared/constants';

/**
 * Allocates one SharedArrayBuffer sized to hold, back to back, the boid transform matrices
 * (Float32, `SAB_BOID_STRIDE` per boid), the boid state ints (4 Int32 per boid), and a
 * fixed 256-slot audio event queue (Int32). Layout/offsets are implicit — any worker that
 * views this buffer must slice it in this same order.
 */
export function createSAB(boidCount: number): SharedArrayBuffer {
  const matrixBytes = boidCount * SAB_BOID_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  const stateBytes = boidCount * 4 * Int32Array.BYTES_PER_ELEMENT;
  const audioBytes = 256 * Int32Array.BYTES_PER_ELEMENT; // 256-slot event queue
  return new SharedArrayBuffer(matrixBytes + stateBytes + audioBytes);
}
