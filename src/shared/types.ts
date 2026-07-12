// Shared TypeScript interfaces used across all workers

/** Per-boid simulation state, written by the sim worker into `SAB_SECTION.STATES`. */
export type BoidState = 'NORMAL' | 'DASH' | 'STUNNED';

/** One entry in the audio event ring buffer (`SAB_SECTION.AUDIO`). */
export interface AudioTrigger {
  type: 'collision' | 'dash' | 'stun';
  intensity: number; // 0–1, used to scale volume and merge duplicates
  boidIndex: number;
}

/** Initial handshake message from the sim worker, handing off the shared boid buffer. */
export interface SimToRenderMessage {
  type: 'init';
  sab: SharedArrayBuffer;
  boidCount: number;
}
