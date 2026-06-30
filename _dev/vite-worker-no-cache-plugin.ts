import type { Plugin } from 'vite'

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
        if (req.url && /\.worker\.[jt]s(\?|$)|worker_file/.test(req.url)) {
          res.setHeader('Cache-Control', 'no-store')
        }
        next()
      })
    },
  }
}
