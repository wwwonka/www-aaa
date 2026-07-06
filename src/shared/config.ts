// ─── Simulation ──────────────────────────────────────────────────────────────

export const BOID_COUNT = 500; // nombre de boids actifs
export const BOID_SPEED = 2.0; // vitesse de croisière (unités/s)
export const BOID_SPEED_DASH = 6.0; // vitesse en mode dash
export const BOID_NEIGHBOR_RADIUS = 3.0; // rayon de détection des voisins
export const BOID_SEPARATION = 1.2; // force de répulsion entre boids
export const BOID_ALIGNMENT = 0.8; // force d'alignement de direction
export const BOID_COHESION = 0.6; // force d'attraction vers le centre du groupe

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
