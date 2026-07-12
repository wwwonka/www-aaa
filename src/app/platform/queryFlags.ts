/** Flags de boot lus une seule fois depuis l'URL — voir CLAUDE.md §11 (routing / query params). */
export interface QueryFlags {
  /** Rôle forcé par `?controller` / `?receiver` — session seulement, jamais persisté. */
  readonly forcedRole: 'controller' | 'receiver' | null;
  /** Code de room de pairing (`?r=CODE`, embarqué dans le QR du receiver) — implique le rôle controller si aucun flag explicite. */
  readonly roomCode: string | null;
  /** `?monolith` — boot mono-thread de debug (DEV uniquement, voir main.ts). */
  readonly monolith: boolean;
  /**
   * `?dev` — flow de dev en mode workers : controller simulé + clavier (DEV uniquement, ignoré
   * en prod : la garde `hasController` reste le seul chemin vers `IN_GAME`).
   */
  readonly dev: boolean;
  /**
   * `?forceTier=low|high` — court-circuite la détection de tier (benchmark + cœurs) pour
   * tester le mode dégradé de façon déterministe (DEV uniquement, ignoré en prod).
   */
  readonly forceTier: 'low' | 'high' | null;
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

  // Normalisé en majuscules : le code est généré dans un alphabet majuscule (voir
  // input/signaling/identity.ts) mais peut être retapé à la main en minuscules.
  const rawRoomCode = params.get('r');
  const roomCode = rawRoomCode !== null && rawRoomCode !== '' ? rawRoomCode.toUpperCase() : null;

  const rawTier = params.get('forceTier');
  if (rawTier !== null && rawTier !== 'low' && rawTier !== 'high') {
    console.warn(`[queryFlags] ?forceTier=${rawTier} invalide — attendu low|high, ignoré`);
  }

  return {
    forcedRole: controller ? 'controller' : receiver ? 'receiver' : null,
    roomCode,
    monolith: params.has('monolith'),
    dev: params.has('dev'),
    forceTier: rawTier === 'low' || rawTier === 'high' ? rawTier : null,
  };
}
