// Shared TypeScript interfaces used across all workers

export type BoidState = 'NORMAL' | 'DASH' | 'STUNNED'

export interface AudioTrigger {
  type: 'collision' | 'dash' | 'stun'
  intensity: number  // 0–1, used to scale volume and merge duplicates
  boidIndex: number
}

export interface SimToRenderMessage {
  type: 'init'
  sab: SharedArrayBuffer
  boidCount: number
}
