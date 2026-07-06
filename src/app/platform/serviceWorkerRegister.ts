import type { RuntimeCategory } from './runtimeDetect'

/**
 * Enregistre le service worker et, sur Firefox desktop, lui demande d'activer le favicon
 * transparent une fois actif (voir transparentFavicon.ts pour le pourquoi).
 */
export async function registerServiceWorker(runtime: RuntimeCategory): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  try {
    await navigator.serviceWorker.register(
      new URL('./serviceWorker.ts', import.meta.url),
      // Sans `scope` explicite, le SW n'est sous portée que de son propre dossier
      // (src/app/platform/) — il ne verrait jamais les fetch() de la page.
      { type: 'module', scope: '/' },
    )

    if (runtime === 'pwa-desktop-firefox') {
      // ready garantit que registration.active existe — évite le race condition
      // où le SW vient d'être installé mais n'est pas encore actif
      const registration = await navigator.serviceWorker.ready
      registration.active!.postMessage({ type: 'enable-transparent-favicon' })
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[SW] registration failed', err)
  }
}
