/// <reference lib="webworker" />
import {
  enableTransparentFavicon,
  handleFaviconFetch,
  restoreTransparentFaviconPref,
} from './pwa/desktop-firefox/transparentFavicon';
import { handleAssetFetch, loadAssetManifest } from '../../core/assets/assetCacheFetch';

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', () => {
  void sw.skipWaiting();
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  // Restaure les prefs persistées + le manifest d'assets avant de prendre le contrôle des clients
  event.waitUntil(
    Promise.all([restoreTransparentFaviconPref(), loadAssetManifest()]).then(() =>
      sw.clients.claim(),
    ),
  );
});

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string } | null;
  if (data?.type === 'enable-transparent-favicon') {
    // waitUntil empêche le SW d'être tué avant la fin de l'écriture Cache API
    event.waitUntil(enableTransparentFavicon());
  }
});

sw.addEventListener('fetch', (event: FetchEvent) => {
  if (handleAssetFetch(event)) return;
  handleFaviconFetch(event);
});
