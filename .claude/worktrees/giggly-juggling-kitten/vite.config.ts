import { defineConfig }          from 'vite'
import mkcert                    from 'vite-plugin-mkcert'
import viteOpenLocalIpPlugin, { bonjourHost } from './_dev/vite-open-local-ip-plugin'
import htmlIncludePlugin         from './_dev/vite-html-include-plugin.ts'
import { ViteMinifyPlugin }      from 'vite-plugin-minify'
import minifyManifestPlugin      from './_dev/vite-minify-manifest-plugin.ts'

// COEP 'require-corp' est requis pour SharedArrayBuffer
// Safari exige en plus CORP sur chaque ressource servie — sans ça les imports worker sont bloqués
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

export default defineConfig({
  plugins: [
    htmlIncludePlugin(),
    mkcert({ savePath: './_dev/.mkcert', hosts: [bonjourHost] }),
    viteOpenLocalIpPlugin(),
    ViteMinifyPlugin(),
    minifyManifestPlugin(),
  ],
  server:  {
    host:         true,
    https:        true,
    // cloudflared quick-tunnel (*.trycloudflare.com) n'est pas une IP LAN ni localhost —
    // Vite rejetterait la requête avec "This host is not allowed" sans cette entrée
    allowedHosts: ['.trycloudflare.com'],
    headers:      crossOriginHeaders,
  },
  preview: { headers: crossOriginHeaders },
  worker:  { format: 'es' },
})
