// DEV only — pilote la sphère de contrôle de la sim au clavier (WASD / flèches) en mode
// monolith, en attendant les joysticks du controller (étape 5).

/** Attache les listeners clavier et retourne une fonction de détachement. */
export function attachKeyboardSimControls(
  onAxes: (dirX: number, dirZ: number) => void,
): () => void {
  const pressed = new Set<string>();

  const apply = (): void => {
    let x = 0;
    let z = 0;
    if (pressed.has('KeyA') || pressed.has('ArrowLeft')) x -= 1;
    if (pressed.has('KeyD') || pressed.has('ArrowRight')) x += 1;
    if (pressed.has('KeyW') || pressed.has('ArrowUp')) z += 1;
    if (pressed.has('KeyS') || pressed.has('ArrowDown')) z -= 1;
    if (x !== 0 && z !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      z *= inv;
    }
    onAxes(x, z);
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    pressed.add(e.code);
    apply();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    pressed.delete(e.code);
    apply();
  };
  const onBlur = (): void => {
    pressed.clear();
    apply();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}

/**
 * Touches C (capture) / R (restore du dernier snapshot) — vérification du round-trip de
 * snapshot (étape 6a) : capturer, laisser tourner, restaurer → l'état doit revenir exactement.
 */
export function attachSnapshotDevKeys(
  capture: () => Promise<ArrayBuffer>,
  restore: (buf: ArrayBuffer) => Promise<void>,
): () => void {
  let lastSnapshot: ArrayBuffer | null = null;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyC') {
      void capture().then((buf) => {
        lastSnapshot = buf;
        console.log(`[simControls] snapshot capturé (${buf.byteLength} octets)`);
      });
    } else if (e.code === 'KeyR') {
      if (lastSnapshot === null) {
        console.warn('[simControls] aucun snapshot à restaurer — presser C d’abord');
        return;
      }
      // Copie : le buffer part en transfert (neutered) — garder l'original re-restaurable.
      void restore(lastSnapshot.slice(0)).then(() => console.log('[simControls] snapshot restauré'));
    }
  };

  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
