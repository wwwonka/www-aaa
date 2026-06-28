import { defineConfig }          from 'vite'
import mkcert                    from 'vite-plugin-mkcert'
import viteOpenNetworkUrlPlugin  from './_dev/vite-open-network-url-plugin'

// COEP 'require-corp' est requis pour SharedArrayBuffer
// Safari exige en plus CORP sur chaque ressource servie — sans ça les imports worker sont bloqués
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

export default defineConfig({
  plugins: [
    mkcert({ savePath: './_dev/.mkcert' }),
    viteOpenNetworkUrlPlugin(),
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
