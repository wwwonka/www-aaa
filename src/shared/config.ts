// ─── Simulation ──────────────────────────────────────────────────────────────

export const BOID_COUNT = 24; // nombre de boids actifs (brief démo : 10-30, Havok complet)
export const BOID_SPEED = 4.0; // vitesse de croisière (unités/s)
export const BOID_SPEED_DASH = 6.0; // vitesse en mode dash
export const BOID_NEIGHBOR_RADIUS = 2.5; // rayon de détection des voisins
export const BOID_SEPARATION = 1.4; // force de répulsion entre boids
export const BOID_ALIGNMENT = 0.6; // force d'alignement de direction
export const BOID_COHESION = 0.4; // force d'attraction vers le centre du groupe
export const BOID_TARGET_SEEK = 1.0; // force d'attraction vers la sphère de contrôle

// ─── Physique (Havok) ────────────────────────────────────────────────────────

export const BOID_RADIUS = 0.35; // rayon du corps sphérique d'un boid (unités monde)
export const BOID_MASS_KG = 1.0; // masse d'un boid
export const BOID_MAX_FORCE = 40; // clamp de la force de steering (N) — évite les téléportations
export const GRAVITY_Y = -9.81; // gravité monde (unités/s²)
export const ARENA_HALF_EXTENT = 11; // demi-largeur de l'arène carrée (sol + murs invisibles)
export const WALL_HEIGHT = 4; // hauteur des murs invisibles de confinement
export const TARGET_SPEED = 6.0; // vitesse de déplacement de la sphère de contrôle (unités/s)
export const SIM_STEP_MS = 1000 / 60; // timestep fixe de la simulation

/** Props poussables — masse >> boids pour une poussée visible mais pas triviale (brief §4). */
export const PROP_DEFS: readonly {
  readonly halfExtents: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly massKg: number;
}[] = [
  { halfExtents: [0.9, 0.9, 0.9], position: [4, 0.9, 3], massKg: 10 },
  { halfExtents: [1.2, 0.6, 0.6], position: [-5, 0.6, -2], massKg: 12 },
  { halfExtents: [0.7, 0.7, 0.7], position: [-2, 0.7, 5], massKg: 8 },
  { halfExtents: [0.6, 1.1, 0.6], position: [6, 1.1, -5], massKg: 11 },
  { halfExtents: [1.0, 0.5, 1.0], position: [0, 0.5, -6], massKg: 14 },
];

// ─── Rendu ───────────────────────────────────────────────────────────────────

export const TARGET_FPS = 60; // cap de la boucle de rendu
export const CAMERA_FOV = 0.8; // champ de vision (radians)
export const CAMERA_NEAR = 0.1; // plan de clipping proche
export const CAMERA_FAR = 1000; // plan de clipping lointain

// ─── Post-processing ─────────────────────────────────────────────────────────

export const BLOOM_INTENSITY = 0.4; // intensité du bloom
export const BLOOM_THRESHOLD = 0.8; // luminosité minimale pour déclencher le bloom
export const TONE_MAPPING_EXPOSURE = 1.0; // exposition globale de la scène

// ─── Audio ───────────────────────────────────────────────────────────────────

export const MASTER_VOLUME = 0.8; // volume global (0–1)
export const SPATIAL_ROLLOFF = 1.5; // atténuation du son avec la distance
