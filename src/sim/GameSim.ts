// Composition de la simulation de jeu : monde Havok + steering boids + écriture des
// matrices monde dans le SAB (section MATRICES). Boucle à pas fixe avec accumulateur.
// API neutre (update/dispose) : consommée par le monolith (dev) aujourd'hui, par
// simulation.worker.ts à l'étape 4 — aucun import rendu/DOM ici.
import {
  BOID_COUNT,
  BOID_RADIUS,
  BOID_MASS_KG,
  ARENA_HALF_EXTENT,
  WALL_HEIGHT,
  TARGET_SPEED,
  SIM_STEP_MS,
  PROP_DEFS,
  REVERSAL_STANDOFF,
} from '../shared/config';
import {
  SAB_BOID_STRIDE,
  CTRL_AXIS_X,
  CTRL_AXIS_Z,
  CTRL_RING_WRITE,
  CTRL_RING_READ,
  CTRL_RING_BASE,
  CTRL_RING_SLOTS,
  CTRL_RING_SLOT_STRIDE,
  CTRL_FIXED_POINT,
} from '../shared/constants';
import { createSAB } from '../core/sab-manager';
import { PhysicsEngine } from './PhysicsEngine';
import type { BodyHandle } from './PhysicsEngine';
import { createBoidSimulation } from './BoidSimulation';
import { createFlockAggregate } from './FlockAggregate';
import { createReversalWave } from './ReversalWave';
import { captureSnapshot, restoreSnapshot } from './snapshot';
import type { SimSnapshotState } from './snapshot';

export interface GameSim {
  /** Matrices monde 4x4 des boids — vue Float32 sur le SAB, lue par le renderer (thin instances). */
  readonly boidMatrices: Float32Array;
  /** Matrices monde 4x4 des props poussables (même stride que les boids). */
  readonly propMatrices: Float32Array;
  readonly boidCount: number;
  readonly propCount: number;
  /** Position courante de la sphère de contrôle invisible (xyz) — lecture seule côté rendu. */
  readonly targetPosition: Float32Array;
  /** Avance la simulation du temps écoulé (pas fixes internes de `SIM_STEP_MS`). */
  update(deltaMs: number): void;
  /** Sérialise l'état complet — layout §B.3, chemin froid (allocations tolérées), sim stoppée de préférence. */
  captureSnapshot(): ArrayBuffer;
  /** Restaure un snapshot ; jette si version/counts ne matchent pas (les deux builds doivent être identiques). */
  restoreSnapshot(buf: ArrayBuffer): void;
  dispose(): void;
}

const MAX_STEPS_PER_UPDATE = 5; // anti "spirale de la mort" si l'onglet reprend après un gel

/**
 * @param controlView - vue Int32 sur le SAB de contrôle (`createControlSAB`), unique voie
 * d'entrée des inputs : axes atomiques latest-wins + ring d'actions discrètes (CLAUDE.md §7).
 */
export async function createGameSim(controlView: Int32Array): Promise<GameSim> {
  const physics = await PhysicsEngine.create();

  // Sol (face supérieure à y=0) + murs invisibles de confinement.
  const wallThickness = 0.5;
  const e = ARENA_HALF_EXTENT + wallThickness;
  physics.addStaticBox([e, 0.5, e], 0, -0.5, 0);
  physics.addStaticBox([wallThickness, WALL_HEIGHT / 2, e], e, WALL_HEIGHT / 2, 0);
  physics.addStaticBox([wallThickness, WALL_HEIGHT / 2, e], -e, WALL_HEIGHT / 2, 0);
  physics.addStaticBox([e, WALL_HEIGHT / 2, wallThickness], 0, WALL_HEIGHT / 2, e);
  physics.addStaticBox([e, WALL_HEIGHT / 2, wallThickness], 0, WALL_HEIGHT / 2, -e);

  // Boids : anneau autour de l'origine, posés sur le sol.
  const boidHandles: BodyHandle[] = [];
  for (let i = 0; i < BOID_COUNT; i++) {
    const angleRad = (i / BOID_COUNT) * Math.PI * 2;
    const ringRadius = 3 + (i % 3) * 0.9;
    boidHandles.push(
      physics.addDynamicSphere(
        BOID_RADIUS,
        BOID_MASS_KG,
        Math.cos(angleRad) * ringRadius,
        BOID_RADIUS + 0.05,
        Math.sin(angleRad) * ringRadius,
      ),
    );
  }

  const propHandles: BodyHandle[] = PROP_DEFS.map((def) =>
    physics.addDynamicBox(def.halfExtents, def.massKg, ...def.position),
  );

  const boidMatrices = new Float32Array(createSAB(BOID_COUNT), 0, BOID_COUNT * SAB_BOID_STRIDE);
  const propMatrices = new Float32Array(
    new SharedArrayBuffer(PROP_DEFS.length * SAB_BOID_STRIDE * Float32Array.BYTES_PER_ELEMENT),
  );

  const steering = createBoidSimulation(BOID_COUNT, ARENA_HALF_EXTENT);
  // Flock-comme-entité + demi-tour intentionnel : détection sur le moveInput réduit (agnostique
  // de la source), téléport de la sphère au nouveau front, onde de bascule à travers le banc.
  const flock = createFlockAggregate();
  const reversal = createReversalWave(BOID_COUNT);
  const positions = new Float32Array(BOID_COUNT * 3);
  const prevPositions = new Float32Array(BOID_COUNT * 3);
  const velocities = new Float32Array(BOID_COUNT * 3);
  const forces = new Float32Array(BOID_COUNT * 3);
  // Heading persistant par boid — conservé quand la vitesse est quasi nulle (pas de flip du mesh).
  const headings = new Float32Array(BOID_COUNT * 2);
  for (let i = 0; i < BOID_COUNT; i++) headings[i * 2 + 1] = 1;

  // SAB aussi pour la cible : en mode workers le marqueur est lu par le render worker.
  const targetPosition = new Float32Array(new SharedArrayBuffer(3 * Float32Array.BYTES_PER_ELEMENT));
  const moveInput = new Float32Array(2);
  let accumulatorMs = 0;

  const readAllPositions = (): void => {
    for (let i = 0; i < BOID_COUNT; i++) physics.readPosition(boidHandles[i], positions, i * 3);
  };

  const writeMatrices = (): void => {
    for (let i = 0; i < BOID_COUNT; i++) {
      const vx = velocities[i * 3];
      const vz = velocities[i * 3 + 2];
      const speed = Math.sqrt(vx * vx + vz * vz);
      if (speed > 0.2) {
        headings[i * 2] = vx / speed;
        headings[i * 2 + 1] = vz / speed;
      }
      // Base orthonormée alignée sur le heading (up = Y monde) — stockage row-major Babylon,
      // translation en 12-14. La rotation du corps Havok est ignorée (damping angulaire fort).
      const fx = headings[i * 2];
      const fz = headings[i * 2 + 1];
      const o = i * SAB_BOID_STRIDE;
      boidMatrices[o] = fz; // right.x  = cross(up, forward)
      boidMatrices[o + 1] = 0;
      boidMatrices[o + 2] = -fx;
      boidMatrices[o + 3] = 0;
      boidMatrices[o + 4] = 0; // up
      boidMatrices[o + 5] = 1;
      boidMatrices[o + 6] = 0;
      boidMatrices[o + 7] = 0;
      boidMatrices[o + 8] = fx; // forward
      boidMatrices[o + 9] = 0;
      boidMatrices[o + 10] = fz;
      boidMatrices[o + 11] = 0;
      boidMatrices[o + 12] = positions[i * 3];
      boidMatrices[o + 13] = positions[i * 3 + 1];
      boidMatrices[o + 14] = positions[i * 3 + 2];
      boidMatrices[o + 15] = 1;
    }
    for (let i = 0; i < propHandles.length; i++) {
      physics.readMatrix(propHandles[i], propMatrices, i * SAB_BOID_STRIDE);
    }
  };

  // Dispatcher central (CLAUDE.md §7) : séquentiel et déterministe — le ring d'actions est
  // drainé dans l'ordre d'écriture, puis les axes sont lus en latest-wins. Seul lecteur du SAB.
  const drainControl = (): void => {
    let read = Atomics.load(controlView, CTRL_RING_READ);
    const write = Atomics.load(controlView, CTRL_RING_WRITE);
    while (read < write) {
      const base = CTRL_RING_BASE + (read % CTRL_RING_SLOTS) * CTRL_RING_SLOT_STRIDE;
      const actionId = Atomics.load(controlView, base);
      // Aucun ActionId n'a encore de producteur (dash/split = moves futurs) — le drain
      // maintient le contrat "aucune action perdue" dès aujourd'hui.
      void actionId;
      read++;
    }
    Atomics.store(controlView, CTRL_RING_READ, read);
    moveInput[0] = Atomics.load(controlView, CTRL_AXIS_X) / CTRL_FIXED_POINT;
    moveInput[1] = Atomics.load(controlView, CTRL_AXIS_Z) / CTRL_FIXED_POINT;
  };

  const clampToArena = (v: number): number => {
    const limit = ARENA_HALF_EXTENT - 1;
    return v > limit ? limit : v < -limit ? -limit : v;
  };

  const stepOnce = (dtSec: number): void => {
    drainControl();
    targetPosition[0] = clampToArena(targetPosition[0] + moveInput[0] * TARGET_SPEED * dtSec);
    targetPosition[2] = clampToArena(targetPosition[2] + moveInput[1] * TARGET_SPEED * dtSec);

    // Demi-tour intentionnel : agrégat du banc (positions du step précédent — suffisant), puis
    // sur inversion franche des sticks, la sphère SAUTE au nouveau front (centroïde + rayon +
    // marge, direction de l'input) et l'onde de bascule est armée depuis ce nouveau « bec ».
    flock.update(positions, BOID_COUNT, velocities);
    if (reversal.detect(moveInput[0], moveInput[1], dtSec)) {
      const oldX = targetPosition[0];
      const oldZ = targetPosition[2];
      const mag = Math.hypot(moveInput[0], moveInput[1]); // ≥ REVERSAL_MIN_INPUT_MAG (detect)
      const standoff = flock.radius + REVERSAL_STANDOFF;
      targetPosition[0] = clampToArena(flock.centroidX + (moveInput[0] / mag) * standoff);
      targetPosition[2] = clampToArena(flock.centroidZ + (moveInput[1] / mag) * standoff);
      reversal.trigger(positions, BOID_COUNT, targetPosition[0], targetPosition[2], oldX, oldZ);
    }
    reversal.advance(dtSec);

    readAllPositions();
    const invDt = 1 / dtSec;
    for (let i = 0; i < BOID_COUNT * 3; i++) {
      velocities[i] = (positions[i] - prevPositions[i]) * invDt;
    }
    prevPositions.set(positions);

    steering.compute(
      positions,
      velocities,
      BOID_COUNT,
      targetPosition[0],
      targetPosition[2],
      forces,
      reversal.waveActive ? reversal : null,
    );
    for (let i = 0; i < BOID_COUNT; i++) {
      physics.applyForce(boidHandles[i], forces[i * 3], 0, forces[i * 3 + 2], dtSec);
    }
    physics.step(dtSec);
  };

  // Snapshot de handoff (§B.3) — layout binaire isolé dans snapshot.ts, GameSim n'expose
  // que la vue sur son état interne (chemin froid, jamais en boucle chaude).
  const snapshotState: SimSnapshotState = {
    physics,
    boidHandles,
    propHandles,
    positions,
    prevPositions,
    velocities,
    headings,
    targetPosition,
    moveInput,
    getAccumulatorMs: () => accumulatorMs,
    setAccumulatorMs: (ms) => {
      accumulatorMs = ms;
    },
    readAllPositions,
    writeMatrices,
  };

  // Premier remplissage : matrices valides avant le premier update (le rendu peut lire tout de suite).
  physics.step(SIM_STEP_MS / 1000);
  readAllPositions();
  prevPositions.set(positions);
  writeMatrices();

  return {
    boidMatrices,
    propMatrices,
    boidCount: BOID_COUNT,
    propCount: PROP_DEFS.length,
    targetPosition,
    update(deltaMs: number): void {
      accumulatorMs += deltaMs;
      let steps = 0;
      while (accumulatorMs >= SIM_STEP_MS && steps < MAX_STEPS_PER_UPDATE) {
        stepOnce(SIM_STEP_MS / 1000);
        steps++;
        accumulatorMs -= SIM_STEP_MS;
      }
      if (accumulatorMs > SIM_STEP_MS) accumulatorMs = 0; // retard irrattrapable : on lâche
      if (steps > 0) writeMatrices();
    },
    captureSnapshot: () => captureSnapshot(snapshotState),
    restoreSnapshot: (buf) => {
      restoreSnapshot(buf, snapshotState);
      // État détection/onde volontairement éphémère (hors layout snapshot §B.3) : un handoff en
      // pleine inversion abandonne juste l'onde en cours — bénin.
      reversal.reset();
    },
    dispose(): void {
      physics.dispose();
    },
  };
}
