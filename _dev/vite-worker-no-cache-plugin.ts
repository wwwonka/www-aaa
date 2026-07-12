import type { Plugin } from 'vite';

/**
 * Safari (WebKit) ne réapplique pas les en-têtes Cross-Origin-Resource-Policy/COEP sur les
 * réponses `304 Not Modified` — uniquement sur les `200 OK`. Une fois qu'un fichier worker
 * (`*.worker.ts`, ou son chunk `?worker_file`) est servi en 304 au reload suivant, Safari le
 * bloque avec "Refused to load ... because of Cross-Origin-Embedder-Policy" alors que le même
 * fichier avait chargé sans problème juste avant.
 *
 * Bug WebKit confirmé : https://bugs.webkit.org/show_bug.cgi?id=245346 et
 * https://bugs.webkit.org/show_bug.cgi?id=254065 ("Cross-Origin-Embedder-Policy incorrectly
 * blocks scripts/iframe on cache hit").
 *
 * Fix : forcer `Cache-Control: no-store` sur les requêtes de fichiers worker pour empêcher
 * tout 304 sur ces fichiers précis — pas une désactivation globale du cache du dev server.
 */
export default function workerNoCachePlugin(): Plugin {
  return {
    name: 'worker-no-cache',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // WebKit perd les en-têtes COEP/CORP sur les 304 pour TOUT script chargé dans un
        // contexte COEP (pas seulement les fichiers worker) — les imports profonds d'un module
        // worker (ex: les ~1400 modules Babylon en dev) sont refusés pareil au cache hit.
        // Poser `Cache-Control: no-store` ne suffit plus (le middleware transform de Vite
        // réécrit l'en-tête en `no-cache` au send) : on supprime les validateurs conditionnels
        // de la requête — sans eux aucun 304 n'est possible, Vite renvoie toujours un 200
        // complet avec les en-têtes. Scopé aux UA WebKit/Safari pour garder les 304 ailleurs.
        const ua = req.headers['user-agent'] ?? '';
        const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
        const isWorkerFile = req.url && /\.worker\.[jt]s(\?|$)|worker_file/.test(req.url);
        const isModule = req.url && /\.([jt]s|mjs)($|\?)/.test(req.url);
        if (isWorkerFile || (isSafari && isModule)) {
          delete req.headers['if-none-match'];
          delete req.headers['if-modified-since'];
          res.setHeader('Cache-Control', 'no-store');
        }
        next();
      });
    },
  };
}
