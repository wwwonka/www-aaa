/** Flags de boot lus une seule fois depuis l'URL — voir CLAUDE.md §11 (routing / query params). */
export interface QueryFlags {
  /** Rôle forcé par `?controller` / `?receiver` — session seulement, jamais persisté. */
  readonly forcedRole: 'controller' | 'receiver' | null;
  /** `?monolith` — boot mono-thread de debug (DEV uniquement, voir main.ts). */
  readonly monolith: boolean;
}

/**
 * Parse pur de la query string — aucune lecture d'état global autre que `search`, aucun effet
 * de bord (le choix de *quoi faire* des flags appartient à `main.ts` / `AppHost`).
 *
 * @param search - La query string de la page, ex. `window.location.search`.
 */
export function parseQueryFlags(search: string): QueryFlags {
  const params = new URLSearchParams(search);

  const controller = params.has('controller');
  const receiver = params.has('receiver');
  if (controller && receiver) {
    console.warn('[queryFlags] ?controller et ?receiver simultanés — controller prioritaire');
  }

  return {
    forcedRole: controller ? 'controller' : receiver ? 'receiver' : null,
    monolith: params.has('monolith'),
  };
}
