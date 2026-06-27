// Allocates and slices the SharedArrayBuffer for all workers
import { SAB_BOID_STRIDE } from '../shared/constants'

export function createSAB(boidCount: number): SharedArrayBuffer {
  const matrixBytes = boidCount * SAB_BOID_STRIDE * Float32Array.BYTES_PER_ELEMENT
  const stateBytes  = boidCount * 4 * Int32Array.BYTES_PER_ELEMENT
  const audioBytes  = 256 * Int32Array.BYTES_PER_ELEMENT  // 256-slot event queue
  return new SharedArrayBuffer(matrixBytes + stateBytes + audioBytes)
}
