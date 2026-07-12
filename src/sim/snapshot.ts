// Codec du snapshot de handoff (docs/progress/design-etapes-5-6.md §B.3) — sérialise l'état
// complet de la sim (physique + steering + contrôle) dans un ArrayBuffer little-endian
// versionné, transférable via Comlink et envoyable tel quel via Trystero. Chemin froid :
// les getters du binding hknp allouent, tolérable ici (jamais appelé en boucle chaude).
import {
  SNAPSHOT_VERSION,
  SNAPSHOT_HEADER_BYTES,
  SNAPSHOT_CONTROL_BYTES,
  SNAPSHOT_BOID_BYTES,
  SNAPSHOT_PROP_BYTES,
} from '../shared/constants';
import { SIM_STEP_MS } from '../shared/config';
import type { PhysicsEngine, BodyHandle } from './PhysicsEngine';

/** Vue de GameSim sur son propre état interne — le codec lit/écrit à travers elle. */
export interface SimSnapshotState {
  readonly physics: PhysicsEngine;
  readonly boidHandles: readonly BodyHandle[];
  readonly propHandles: readonly BodyHandle[];
  readonly positions: Float32Array;
  readonly prevPositions: Float32Array;
  readonly velocities: Float32Array;
  readonly headings: Float32Array;
  /** SAB partagé avec le render — restauré in-place, jamais réalloué. */
  readonly targetPosition: Float32Array;
  readonly moveInput: Float32Array;
  getAccumulatorMs(): number;
  setAccumulatorMs(ms: number): void;
  /** Rafraîchit `positions` depuis le monde physique. */
  readAllPositions(): void;
  /** Réécrit les matrices SAB — le premier frame rendu post-restore est déjà cohérent. */
  writeMatrices(): void;
}

export function captureSnapshot(state: SimSnapshotState): ArrayBuffer {
  const { physics, boidHandles, propHandles, positions, headings } = state;
  const buf = new ArrayBuffer(
    SNAPSHOT_HEADER_BYTES +
      SNAPSHOT_CONTROL_BYTES +
      boidHandles.length * SNAPSHOT_BOID_BYTES +
      propHandles.length * SNAPSHOT_PROP_BYTES,
  );
  const view = new DataView(buf);
  view.setUint16(0, SNAPSHOT_VERSION, true);
  view.setUint16(2, boidHandles.length, true);
  view.setUint16(4, propHandles.length, true);
  view.setFloat32(8, state.getAccumulatorMs(), true);
  view.setFloat32(12, state.targetPosition[0], true);
  view.setFloat32(16, state.targetPosition[1], true);
  view.setFloat32(20, state.targetPosition[2], true);
  view.setFloat32(24, state.moveInput[0], true);
  view.setFloat32(28, state.moveInput[1], true);

  state.readAllPositions();
  let o = SNAPSHOT_HEADER_BYTES + SNAPSHOT_CONTROL_BYTES;
  for (let i = 0; i < boidHandles.length; i++) {
    // Vitesses PHYSIQUES (pas les dérivées de positions) : c'est elles que le monde Havok
    // distant doit recevoir pour que la trajectoire continue.
    const vel = physics.readLinearVelocity(boidHandles[i]);
    view.setFloat32(o, positions[i * 3], true);
    view.setFloat32(o + 4, positions[i * 3 + 1], true);
    view.setFloat32(o + 8, positions[i * 3 + 2], true);
    view.setFloat32(o + 12, vel[0], true);
    view.setFloat32(o + 16, vel[1], true);
    view.setFloat32(o + 20, vel[2], true);
    view.setFloat32(o + 24, headings[i * 2], true);
    view.setFloat32(o + 28, headings[i * 2 + 1], true);
    o += SNAPSHOT_BOID_BYTES;
  }
  for (let i = 0; i < propHandles.length; i++) {
    const [pos, quat] = physics.readQTransform(propHandles[i]);
    const linVel = physics.readLinearVelocity(propHandles[i]);
    const angVel = physics.readAngularVelocity(propHandles[i]);
    view.setFloat32(o, pos[0], true);
    view.setFloat32(o + 4, pos[1], true);
    view.setFloat32(o + 8, pos[2], true);
    view.setFloat32(o + 12, quat[0], true);
    view.setFloat32(o + 16, quat[1], true);
    view.setFloat32(o + 20, quat[2], true);
    view.setFloat32(o + 24, quat[3], true);
    view.setFloat32(o + 28, linVel[0], true);
    view.setFloat32(o + 32, linVel[1], true);
    view.setFloat32(o + 36, linVel[2], true);
    view.setFloat32(o + 40, angVel[0], true);
    view.setFloat32(o + 44, angVel[1], true);
    view.setFloat32(o + 48, angVel[2], true);
    o += SNAPSHOT_PROP_BYTES;
  }
  return buf;
}

/** Jette si version/counts ne matchent pas — les deux builds doivent être identiques (garde-fou). */
export function restoreSnapshot(buf: ArrayBuffer, state: SimSnapshotState): void {
  const { physics, boidHandles, propHandles } = state;
  const view = new DataView(buf);
  const version = view.getUint16(0, true);
  const snapBoids = view.getUint16(2, true);
  const snapProps = view.getUint16(4, true);
  if (
    version !== SNAPSHOT_VERSION ||
    snapBoids !== boidHandles.length ||
    snapProps !== propHandles.length
  ) {
    throw new Error(
      `[snapshot] incompatible (v${version}, ${snapBoids} boids, ${snapProps} props — ` +
        `attendu v${SNAPSHOT_VERSION}, ${boidHandles.length}, ${propHandles.length})`,
    );
  }
  state.setAccumulatorMs(view.getFloat32(8, true));
  state.targetPosition[0] = view.getFloat32(12, true);
  state.targetPosition[1] = view.getFloat32(16, true);
  state.targetPosition[2] = view.getFloat32(20, true);
  state.moveInput[0] = view.getFloat32(24, true);
  state.moveInput[1] = view.getFloat32(28, true);

  const dtSec = SIM_STEP_MS / 1000;
  const pos: [number, number, number] = [0, 0, 0];
  const vel: [number, number, number] = [0, 0, 0];
  const identityQuat: [number, number, number, number] = [0, 0, 0, 1];
  const quat: [number, number, number, number] = [0, 0, 0, 1];
  const angVel: [number, number, number] = [0, 0, 0];
  const zeroAngVel: [number, number, number] = [0, 0, 0];
  let o = SNAPSHOT_HEADER_BYTES + SNAPSHOT_CONTROL_BYTES;
  for (let i = 0; i < boidHandles.length; i++) {
    pos[0] = view.getFloat32(o, true);
    pos[1] = view.getFloat32(o + 4, true);
    pos[2] = view.getFloat32(o + 8, true);
    vel[0] = view.getFloat32(o + 12, true);
    vel[1] = view.getFloat32(o + 16, true);
    vel[2] = view.getFloat32(o + 20, true);
    // Rotation identité : sphères orientées par la sim (headings), jamais par le corps.
    physics.restoreBody(boidHandles[i], pos, identityQuat, vel, zeroAngVel);
    state.positions[i * 3] = pos[0];
    state.positions[i * 3 + 1] = pos[1];
    state.positions[i * 3 + 2] = pos[2];
    state.velocities[i * 3] = vel[0];
    state.velocities[i * 3 + 1] = vel[1];
    state.velocities[i * 3 + 2] = vel[2];
    // Piège critique (§B.4) : GameSim dérive les vitesses de positions - prevPositions ; poser
    // prev = pos - vel·dt pour que la première dérivation redonne exactement la vitesse
    // restaurée, sinon vel=0 au premier pas et le steering hoquette (LE saut visuel à éviter).
    state.prevPositions[i * 3] = pos[0] - vel[0] * dtSec;
    state.prevPositions[i * 3 + 1] = pos[1] - vel[1] * dtSec;
    state.prevPositions[i * 3 + 2] = pos[2] - vel[2] * dtSec;
    state.headings[i * 2] = view.getFloat32(o + 24, true);
    state.headings[i * 2 + 1] = view.getFloat32(o + 28, true);
    o += SNAPSHOT_BOID_BYTES;
  }
  for (let i = 0; i < propHandles.length; i++) {
    pos[0] = view.getFloat32(o, true);
    pos[1] = view.getFloat32(o + 4, true);
    pos[2] = view.getFloat32(o + 8, true);
    quat[0] = view.getFloat32(o + 12, true);
    quat[1] = view.getFloat32(o + 16, true);
    quat[2] = view.getFloat32(o + 20, true);
    quat[3] = view.getFloat32(o + 24, true);
    vel[0] = view.getFloat32(o + 28, true);
    vel[1] = view.getFloat32(o + 32, true);
    vel[2] = view.getFloat32(o + 36, true);
    angVel[0] = view.getFloat32(o + 40, true);
    angVel[1] = view.getFloat32(o + 44, true);
    angVel[2] = view.getFloat32(o + 48, true);
    physics.restoreBody(propHandles[i], pos, quat, vel, angVel);
    o += SNAPSHOT_PROP_BYTES;
  }
  state.writeMatrices();
}
