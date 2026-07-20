import { describe, expect, it } from 'vitest';
import { createReversalWave } from '../../../src/sim/ReversalWave';
import type { ReversalWave } from '../../../src/sim/ReversalWave';

const DT = 1 / 60;

/** Appelle `detect` avec le même input pendant `steps` pas — rend `true` si l'un a déclenché. */
function feed(wave: ReversalWave, x: number, z: number, steps: number): boolean {
  let triggered = false;
  for (let i = 0; i < steps; i++) triggered = wave.detect(x, z, DT) || triggered;
  return triggered;
}

/** Positions XZ → buffer 3 floats/boid. */
function positionsOf(points: readonly (readonly [number, number])[]): Float32Array {
  const buf = new Float32Array(points.length * 3);
  points.forEach(([x, z], i) => {
    buf[i * 3] = x;
    buf[i * 3 + 2] = z;
  });
  return buf;
}

describe('ReversalWave — détection', () => {
  it('déclenche sur un flip franc à 180° après une direction soutenue', () => {
    const wave = createReversalWave(4);
    expect(feed(wave, 0, 1, 60)).toBe(false); // avancer 1 s : jamais de trigger
    expect(wave.detect(0, -1, DT)).toBe(true); // flip → trigger immédiat
  });

  it('ne déclenche pas sur une correction douce (angle sous le seuil)', () => {
    const wave = createReversalWave(4);
    feed(wave, 0, 1, 60);
    expect(feed(wave, Math.SQRT1_2, Math.SQRT1_2, 30)).toBe(false); // 45°
    const wave2 = createReversalWave(4);
    feed(wave2, 0, 1, 60);
    expect(feed(wave2, 1, 0, 30)).toBe(false); // 90° — toujours sous ~135°
  });

  it('déclenche même après un court passage par le neutre (l\'intention lissée survit)', () => {
    const wave = createReversalWave(4);
    feed(wave, 0, 1, 60);
    expect(feed(wave, 0, 0, 6)).toBe(false); // ~100 ms de neutre (relâche des sticks)
    expect(wave.detect(0, -1, DT)).toBe(true);
  });

  it('n\'exige pas de re-déclenchement pendant le cooldown', () => {
    const wave = createReversalWave(4);
    feed(wave, 0, 1, 60);
    expect(wave.detect(0, -1, DT)).toBe(true);
    // Re-flip immédiat : l'intention soutenue est déjà la nouvelle direction + cooldown actif.
    expect(feed(wave, 0, 1, 10)).toBe(false);
  });

  it('input trop faible : pas de trigger', () => {
    const wave = createReversalWave(4);
    feed(wave, 0, 1, 60);
    expect(feed(wave, 0, -0.3, 30)).toBe(false); // sous REVERSAL_MIN_INPUT_MAG
  });
});

describe('ReversalWave — onde de propagation', () => {
  it('le boid le plus proche du nouveau front bascule immédiatement, les autres en chaîne', () => {
    const wave = createReversalWave(3);
    // Nouveau front en (0, -5) : boid0 à 5, boid1 à 15, boid2 très loin (délai clampé).
    const positions = positionsOf([[0, 0], [0, 10], [0, 100]]);
    wave.trigger(positions, 3, 0, -5, 0, 20);

    expect(wave.waveActive).toBe(true);
    expect(wave.oldTargetX).toBe(0);
    expect(wave.oldTargetZ).toBe(20);
    expect(wave.isBoidOnOldTarget(0)).toBe(false); // délai 0 — premier à tourner
    expect(wave.isBoidOnOldTarget(1)).toBe(true); // délai (15-5)/30 ≈ 0.333 s
    expect(wave.isBoidOnOldTarget(2)).toBe(true); // délai clampé à 0.4 s

    // ~0.2 s : boid1 attend encore.
    for (let i = 0; i < 12; i++) wave.advance(DT);
    expect(wave.isBoidOnOldTarget(1)).toBe(true);

    // ~0.37 s : boid1 basculé, boid2 (clampé à 0.4) pas encore, onde toujours active.
    for (let i = 0; i < 10; i++) wave.advance(DT);
    expect(wave.isBoidOnOldTarget(1)).toBe(false);
    expect(wave.isBoidOnOldTarget(2)).toBe(true);

    // Après le délai max, l'onde se termine : tout le monde sur la nouvelle cible.
    for (let i = 0; i < 5; i++) wave.advance(DT);
    expect(wave.waveActive).toBe(false);
    expect(wave.isBoidOnOldTarget(2)).toBe(false);
  });

  it('reset : onde abandonnée et détection ré-armée à neutre (cas restore de snapshot)', () => {
    const wave = createReversalWave(2);
    feed(wave, 0, 1, 60);
    wave.trigger(positionsOf([[0, 0], [0, 10]]), 2, 0, -5, 0, 20);
    wave.reset();

    expect(wave.waveActive).toBe(false);
    expect(wave.isBoidOnOldTarget(1)).toBe(false);
    // Après reset, un flip immédiat ne déclenche pas (aucune intention soutenue).
    expect(wave.detect(0, -1, DT)).toBe(false);
  });
});
