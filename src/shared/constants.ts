// SharedArrayBuffer memory layout – single source of truth for all workers

export const SAB_BOID_STRIDE = 16; // floats per boid (4x4 matrix)

export const SAB_SECTION = {
  MATRICES: 0, // Float32: boid world matrices
  STATES: 1, // Int32:   health, energy, flags (isStunned…)
  AUDIO: 2, // Int32:   circular event queue (triggers + intensity)
} as const;

// Atomics indices inside SAB_SECTION.AUDIO
export const AUDIO_WRITE_HEAD = 0;
export const AUDIO_READ_HEAD = 1;

// Control SAB (main → sim, CLAUDE.md §7) — Int32 layout, docs/progress/design-etapes-5-6.md §A.4.
// Axes = latest-wins (une valeur écrasée avant lecture est la policy voulue) ;
// ring = actions discrètes (aucune ne doit être perdue), même mécanique que la queue audio.
export const CTRL_AXIS_X = 0; // fixed-point: float * CTRL_FIXED_POINT
export const CTRL_AXIS_Z = 1;
export const CTRL_RING_WRITE = 2; // tête d'écriture (main), compteur monotone
export const CTRL_RING_READ = 3; // tête de lecture (sim)
export const CTRL_RING_BASE = 4;
export const CTRL_RING_SLOTS = 64;
export const CTRL_RING_SLOT_STRIDE = 2; // [actionId, argFixedPoint]
export const CTRL_FIXED_POINT = 65536;
export const CTRL_SAB_INT32_LENGTH = CTRL_RING_BASE + CTRL_RING_SLOTS * CTRL_RING_SLOT_STRIDE;

// Payload input RTC controller → receiver (docs/progress/design-etapes-5-6.md §A.3) —
// 6 octets little-endian : int16 dirX | int16 dirZ | uint16 seq (latest-wins).
export const INPUT_PAYLOAD_BYTES = 6;
export const INPUT_AXIS_QUANT = 32767; // pleine échelle int16 pour un axe normalisé [-1, 1]

// Snapshot de handoff (docs/progress/design-etapes-5-6.md §B.3) — ArrayBuffer little-endian
// versionné : header | contrôle | boids | props. Mismatch version/counts au restore = rejet
// (garde-fou builds identiques, pas une compat multi-versions).
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_HEADER_BYTES = 12; // u16 version | u16 boidCount | u16 propCount | u16 réservé | f32 accumulatorMs
export const SNAPSHOT_CONTROL_BYTES = 20; // f32×3 targetPosition | f32×2 moveInput
export const SNAPSHOT_BOID_BYTES = 32; // pos f32×3 | vel f32×3 | heading f32×2
export const SNAPSHOT_PROP_BYTES = 52; // pos f32×3 | quat f32×4 | linVel f32×3 | angVel f32×3

// ActionIds numériques — DASH/SPLIT réservés au ring sim (aucun producteur avant les moves de
// l'étape 5+) ; CONFIRM (valider/start) et MENU (pause/reprise) sont des signaux UI consommés par
// le FSM main-thread, jamais poussés dans le ring. Dans `ControllerFrame.actions`, un ActionId
// occupe le bit `1 << id`.
export const ACTION_ID = {
  DASH: 1,
  SPLIT: 2,
  CONFIRM: 3,
  MENU: 4,
} as const;
export type ActionId = (typeof ACTION_ID)[keyof typeof ACTION_ID];
