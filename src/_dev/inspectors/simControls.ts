// DEV only — pilote la sphère de contrôle de la sim au clavier (WASD / flèches) en mode
// monolith, en attendant les joysticks du controller (étape 5).

/** Attache les listeners clavier et retourne une fonction de détachement. */
export function attachKeyboardSimControls(
  setMoveInput: (dirX: number, dirZ: number) => void,
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
    setMoveInput(x, z);
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
