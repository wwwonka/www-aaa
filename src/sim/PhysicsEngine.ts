// Monde physique Havok via le binding wasm brut (hknp) — AUCUN import Babylon ici :
// le domaine sim doit rester portable tel quel dans simulation.worker.ts (étape 4).
// Référence d'implémentation : le plugin HavokPlugin de @babylonjs/core (wrapper du même binding).
import HavokPhysics from '@babylonjs/havok';
import type { HavokPhysicsWithBindings, QTransform, Quaternion, Vector3 } from '@babylonjs/havok';
import wasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { GRAVITY_Y } from '../shared/config';

/** Handle opaque d'un corps créé par {@link PhysicsEngine} — index stable, jamais réutilisé. */
export type BodyHandle = number;

type HP_BodyId = ReturnType<HavokPhysicsWithBindings['HP_Body_Create']>[1];
type HP_ShapeId = ReturnType<HavokPhysicsWithBindings['HP_Shape_CreateSphere']>[1];

const IDENTITY_ROTATION: [number, number, number, number] = [0, 0, 0, 1];

// Scratch réutilisés à chaque appel — le binding wasm lit les valeurs immédiatement,
// muter ces tuples évite toute allocation en boucle chaude.
const scratchVecA: Vector3 = [0, 0, 0];
const scratchVecB: Vector3 = [0, 0, 0];

/**
 * Encapsule le monde Havok : création des corps, step à pas fixe, lecture zéro-allocation des
 * transforms 4x4 directement dans le heap wasm (`HP_World_GetBodyBuffer` + offset par corps,
 * même mécanique que le plugin Babylon `syncTransform`). Si l'API brute devenait intenable,
 * seule cette classe serait à réécrire (bascule NullEngine possible sans toucher au reste).
 */
export class PhysicsEngine {
  private readonly _hk: HavokPhysicsWithBindings;
  private readonly _world: ReturnType<HavokPhysicsWithBindings['HP_World_Create']>[1];
  private readonly _bodies: HP_BodyId[] = [];
  /** Offsets (octets) du transform 4x4 de chaque corps, relatifs au body buffer wasm. */
  private readonly _transformOffsets: number[] = [];
  private _bodyBufferBase = 0;

  private constructor(hk: HavokPhysicsWithBindings) {
    this._hk = hk;
    this._world = hk.HP_World_Create()[1];
    scratchVecA[0] = 0;
    scratchVecA[1] = GRAVITY_Y;
    scratchVecA[2] = 0;
    hk.HP_World_SetGravity(this._world, scratchVecA);
  }

  static async create(): Promise<PhysicsEngine> {
    const hk = await HavokPhysics({ locateFile: () => wasmUrl });
    return new PhysicsEngine(hk);
  }

  /** Sphère dynamique (boid). Amortissement angulaire fort : le mesh est orienté par la sim, pas par la rotation du corps. */
  addDynamicSphere(radiusM: number, massKg: number, x: number, y: number, z: number): BodyHandle {
    const shape = this._hk.HP_Shape_CreateSphere([0, 0, 0], radiusM)[1];
    this._setMaterial(shape, 0.3);
    const body = this._createBody(shape, x, y, z);
    this._hk.HP_Body_SetMotionType(body, this._hk.MotionType.DYNAMIC);
    this._hk.HP_Body_SetMassProperties(body, [[0, 0, 0], massKg, [1, 1, 1], IDENTITY_ROTATION]);
    this._hk.HP_Body_SetLinearDamping(body, 0.4);
    this._hk.HP_Body_SetAngularDamping(body, 10);
    return this._register(body);
  }

  /** Boîte dynamique (prop poussable). */
  addDynamicBox(
    halfExtents: readonly [number, number, number],
    massKg: number,
    x: number,
    y: number,
    z: number,
  ): BodyHandle {
    const body = this._createBody(this._createBoxShape(halfExtents, 0.6), x, y, z);
    this._hk.HP_Body_SetMotionType(body, this._hk.MotionType.DYNAMIC);
    this._hk.HP_Body_SetMassProperties(body, [[0, 0, 0], massKg, [1, 1, 1], IDENTITY_ROTATION]);
    this._hk.HP_Body_SetLinearDamping(body, 0.8);
    this._hk.HP_Body_SetAngularDamping(body, 1.5);
    return this._register(body);
  }

  /** Boîte statique (sol, murs invisibles). */
  addStaticBox(
    halfExtents: readonly [number, number, number],
    x: number,
    y: number,
    z: number,
  ): BodyHandle {
    const body = this._createBody(this._createBoxShape(halfExtents, 0.8), x, y, z);
    this._hk.HP_Body_SetMotionType(body, this._hk.MotionType.STATIC);
    return this._register(body);
  }

  /** Force continue appliquée au centre de masse pendant `dtSec` (convertie en impulsion). */
  applyForce(handle: BodyHandle, fx: number, fy: number, fz: number, dtSec: number): void {
    const f32 = this._heapF32();
    const base = this._transformFloatIndex(handle);
    scratchVecA[0] = f32[base + 12];
    scratchVecA[1] = f32[base + 13];
    scratchVecA[2] = f32[base + 14];
    scratchVecB[0] = fx * dtSec;
    scratchVecB[1] = fy * dtSec;
    scratchVecB[2] = fz * dtSec;
    this._hk.HP_Body_ApplyImpulse(this._bodies[handle], scratchVecA, scratchVecB);
  }

  /** Copie la position monde du corps dans `out` à `outOffset` (3 floats), sans allocation. */
  readPosition(handle: BodyHandle, out: Float32Array, outOffset: number): void {
    const f32 = this._heapF32();
    const base = this._transformFloatIndex(handle);
    out[outOffset] = f32[base + 12];
    out[outOffset + 1] = f32[base + 13];
    out[outOffset + 2] = f32[base + 14];
  }

  /** Copie la matrice monde 4x4 du corps dans `out` à `outOffset` (16 floats), sans allocation. */
  readMatrix(handle: BodyHandle, out: Float32Array, outOffset: number): void {
    const f32 = this._heapF32();
    const base = this._transformFloatIndex(handle);
    for (let i = 0; i < 16; i++) out[outOffset + i] = f32[base + i];
  }

  /** Vélocité linéaire — chemin froid uniquement (snapshot de handoff, étape 6) : le binding alloue. */
  readLinearVelocity(handle: BodyHandle): Vector3 {
    return this._hk.HP_Body_GetLinearVelocity(this._bodies[handle])[1];
  }

  /** Position + rotation (quaternion) — chemin froid uniquement (snapshot) : le binding alloue. */
  readQTransform(handle: BodyHandle): QTransform {
    return this._hk.HP_Body_GetQTransform(this._bodies[handle])[1];
  }

  /** Vélocité angulaire — chemin froid uniquement (snapshot) : le binding alloue. */
  readAngularVelocity(handle: BodyHandle): Vector3 {
    return this._hk.HP_Body_GetAngularVelocity(this._bodies[handle])[1];
  }

  /** Restaure transform + vélocités d'un corps (restore de snapshot, chemin froid). */
  restoreBody(
    handle: BodyHandle,
    position: Vector3,
    rotation: Quaternion,
    linearVelocity: Vector3,
    angularVelocity: Vector3,
  ): void {
    const body = this._bodies[handle];
    this._hk.HP_Body_SetQTransform(body, [position, rotation]);
    this._hk.HP_Body_SetLinearVelocity(body, linearVelocity);
    this._hk.HP_Body_SetAngularVelocity(body, angularVelocity);
    // Un batch de Set peut réallouer le body buffer (comme un step) — resynchro immédiate.
    this._bodyBufferBase = this._hk.HP_World_GetBodyBuffer(this._world)[1];
  }

  step(dtSec: number): void {
    this._hk.HP_World_Step(this._world, dtSec);
    // Le body buffer peut être invalidé par un step (réallocation interne) — rafraîchi ici.
    this._bodyBufferBase = this._hk.HP_World_GetBodyBuffer(this._world)[1];
  }

  dispose(): void {
    this._hk.HP_World_Release(this._world);
  }

  private _setMaterial(shape: HP_ShapeId, friction: number): void {
    this._hk.HP_Shape_SetMaterial(shape, [
      friction,
      friction,
      0.1,
      this._hk.MaterialCombine.GEOMETRIC_MEAN,
      this._hk.MaterialCombine.GEOMETRIC_MEAN,
    ]);
  }

  private _createBoxShape(
    halfExtents: readonly [number, number, number],
    friction: number,
  ): HP_ShapeId {
    scratchVecA[0] = halfExtents[0] * 2;
    scratchVecA[1] = halfExtents[1] * 2;
    scratchVecA[2] = halfExtents[2] * 2;
    const shape = this._hk.HP_Shape_CreateBox([0, 0, 0], IDENTITY_ROTATION, scratchVecA)[1];
    this._setMaterial(shape, friction);
    return shape;
  }

  private _createBody(shape: HP_ShapeId, x: number, y: number, z: number): HP_BodyId {
    const body = this._hk.HP_Body_Create()[1];
    this._hk.HP_Body_SetShape(body, shape);
    scratchVecA[0] = x;
    scratchVecA[1] = y;
    scratchVecA[2] = z;
    this._hk.HP_Body_SetQTransform(body, [scratchVecA, IDENTITY_ROTATION]);
    return body;
  }

  private _register(body: HP_BodyId): BodyHandle {
    this._hk.HP_World_AddBody(this._world, body, false);
    const handle = this._bodies.length;
    this._bodies.push(body);
    this._transformOffsets.push(this._hk.HP_Body_GetWorldTransformOffset(body)[1]);
    this._bodyBufferBase = this._hk.HP_World_GetBodyBuffer(this._world)[1];
    return handle;
  }

  /** HEAPF32 relu à chaque accès : une croissance du heap wasm invalide les vues précédentes. */
  private _heapF32(): Float32Array {
    return this._hk.HEAPF32;
  }

  private _transformFloatIndex(handle: BodyHandle): number {
    return (this._bodyBufferBase + this._transformOffsets[handle]) >> 2;
  }
}
