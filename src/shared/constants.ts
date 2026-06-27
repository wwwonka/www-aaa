// SharedArrayBuffer memory layout – single source of truth for all workers

export const SAB_BOID_STRIDE = 16  // floats per boid (4x4 matrix)

export const SAB_SECTION = {
  MATRICES: 0,       // Float32: boid world matrices
  STATES:   1,       // Int32:   health, energy, flags (isStunned…)
  AUDIO:    2,       // Int32:   circular event queue (triggers + intensity)
} as const

// Atomics indices inside SAB_SECTION.AUDIO
export const AUDIO_WRITE_HEAD = 0
export const AUDIO_READ_HEAD  = 1
