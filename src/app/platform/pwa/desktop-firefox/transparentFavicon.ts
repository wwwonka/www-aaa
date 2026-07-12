/// <reference lib="webworker" />

// 1×1 px PNG transparent — inline pour éviter tout fetch réseau
const TRANSPARENT_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PREFS_CACHE = 'sw-prefs-v1';
const PREFS_FLAG_URL = 'https://sw-internal/transparent-favicon';

let enabled = false;

// Décodée une seule fois — TRANSPARENT_PNG_B64 est constant, inutile de refaire atob() à chaque fetch
const TRANSPARENT_PNG_BYTES = Uint8Array.from(atob(TRANSPARENT_PNG_B64), (c) => c.charCodeAt(0));

/**
 * Restaure le flag depuis Cache API au démarrage du SW — survit aux redémarrages.
 */
export async function restoreTransparentFaviconPref(): Promise<void> {
  const cache = await caches.open(PREFS_CACHE);
  const match = await cache.match(PREFS_FLAG_URL);
  if (match) enabled = true;
}

/**
 * Active le favicon transparent et persiste le choix dans Cache API.
 * Appelé via postMessage depuis le main thread.
 */
export async function enableTransparentFavicon(): Promise<void> {
  enabled = true;
  const cache = await caches.open(PREFS_CACHE);
  await cache.put(PREFS_FLAG_URL, new Response('1'));
}

/**
 * Intercepte les requêtes vers favicon.svg et répond avec un PNG 1×1 transparent
 * quand la préférence est active, pour masquer le favicon dans la barre de titre Firefox desktop.
 */
export function handleFaviconFetch(event: FetchEvent): boolean {
  if (!enabled) return false;
  const url = new URL(event.request.url);
  if (!url.pathname.endsWith('/favicon.svg')) return false;

  event.respondWith(
    Promise.resolve(
      new Response(TRANSPARENT_PNG_BYTES, { headers: { 'Content-Type': 'image/png' } }),
    ),
  );
  return true;
}
