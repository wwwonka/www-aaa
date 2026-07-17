// Vue **passive** des joysticks tactiles (DOM/CSS) — la « vue » du couple MVC dont le contrôleur
// est `TouchSource` (src/input/sources/). Elle clone le <template> déclaré dans index.html (zéro
// createElement), expose la surface qui capte les pointeurs, et se contente d'appliquer des
// `transform`/classes quand le contrôleur le demande. Aucune logique d'input, aucun calcul : elle
// implémente `JoystickVisual` et ne « pense » jamais. Possède aussi le bouton START (mode ready).

import '../joysticks.css';
import type { JoystickVisual, StickSide } from '../../../input/sources/TouchSource';

interface SideElements {
  readonly base: HTMLElement;
  readonly nub: HTMLElement;
}

/**
 * Monte les joysticks + START depuis le template et pilote leur rendu.
 *
 * @throws si le template `#shell-joysticks-template` est absent (index.html incohérent).
 */
export class JoysticksView implements JoystickVisual {
  /** L'élément plein écran qui capte les pointeurs — à passer à la `TouchSource`. */
  readonly surface: HTMLElement;

  private readonly _start: HTMLButtonElement;
  private readonly _sides: Record<StickSide, SideElements>;

  constructor(root: HTMLElement, onStart: () => void) {
    const template = document.getElementById('shell-joysticks-template');
    if (!(template instanceof HTMLTemplateElement)) {
      throw new Error('[JoysticksView] template #shell-joysticks-template introuvable');
    }
    const fragment = template.content.cloneNode(true) as DocumentFragment;

    this.surface = must(fragment.querySelector('[data-role="surface"]'));
    this._start = must(fragment.querySelector('[data-role="start"]'));
    this._sides = {
      left: sideElements(fragment, 'left'),
      right: sideElements(fragment, 'right'),
    };
    this._start.addEventListener('click', onStart);
    root.append(fragment);
  }

  // --- JoystickVisual (ordres de dessin donnés par TouchSource, en pixels écran) ---

  place(side: StickSide, baseX: number, baseY: number): void {
    const { base, nub } = this._sides[side];
    base.style.transform = `translate(${baseX}px, ${baseY}px)`;
    base.classList.add('shell-stick-base--visible');
    nub.classList.add('shell-stick-nub--visible');
  }

  moveNub(side: StickSide, x: number, y: number): void {
    this._sides[side].nub.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide(side: StickSide): void {
    const { base, nub } = this._sides[side];
    base.classList.remove('shell-stick-base--visible');
    nub.classList.remove('shell-stick-nub--visible');
  }

  // --- Lifecycle piloté par ShellHost ---

  /** Active la surface (pointer-events) — en jeu uniquement. */
  setActive(active: boolean): void {
    this.surface.classList.toggle('shell-joysticks--active', active);
  }

  /** Affiche/masque le bouton START (état ready du controller). */
  showStart(visible: boolean): void {
    this._start.classList.toggle('shell-start--visible', visible);
  }
}

/** Récupère base + nub d'un côté dans le fragment cloné. */
function sideElements(fragment: DocumentFragment, side: StickSide): SideElements {
  return {
    base: must(fragment.querySelector(`.shell-stick-base[data-side="${side}"]`)),
    nub: must(fragment.querySelector(`.shell-stick-nub[data-side="${side}"]`)),
  };
}

/** Garde fail-fast : le template est notre contrat ; une absence est un bug de build, pas un cas runtime. */
function must<T extends HTMLElement>(el: Element | null): T {
  if (el === null) throw new Error('[JoysticksView] élément de template manquant');
  return el as T;
}
