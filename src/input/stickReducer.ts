export interface StickAxes {
  readonly x: number;
  readonly z: number;
}

const clampUnit = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

/**
 * Réduit deux sticks vers une direction unique (policy étape 5b) :
 * moyenne des sticks actifs, puis renormalisation si magnitude > 1.
 */
export function reduceSticks(left: StickAxes, right: StickAxes): StickAxes {
  const leftActive = left.x !== 0 || left.z !== 0;
  const rightActive = right.x !== 0 || right.z !== 0;

  if (!leftActive && !rightActive) return { x: 0, z: 0 };
  if (!leftActive) return { x: clampUnit(right.x), z: clampUnit(right.z) };
  if (!rightActive) return { x: clampUnit(left.x), z: clampUnit(left.z) };

  const x = (left.x + right.x) * 0.5;
  const z = (left.z + right.z) * 0.5;
  const mag = Math.hypot(x, z);
  if (mag <= 1) return { x, z };
  return { x: x / mag, z: z / mag };
}
