import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import viteOpenLocalIpPlugin from './_dev/vite-open-local-ip-plugin';
import htmlIncludePlugin from './_dev/vite-html-include-plugin.ts';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import minifyManifestPlugin from './_dev/vite-minify-manifest-plugin.ts';
import { bundleSizePlugin } from './_dev/vite-bundle-size-plugin.ts';
import assetManifestPlugin from './_dev/vite-asset-manifest-plugin.ts';
import workerNoCachePlugin from './_dev/vite-worker-no-cache-plugin.ts';
import animPlugin from './_dev/vite-anim-plugin.ts';
import checker from 'vite-plugin-checker';

// COEP 'require-corp' est requis pour SharedArrayBuffer
// Safari exige en plus CORP sur chaque ressource servie — sans ça les imports worker sont bloqués
const crossOriginHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  // serviceWorker.ts vit dans src/app/platform/ — sans cet en-tête, le scope max autorisé
  // par le navigateur est borné à ce dossier et register(..., { scope: '/' }) échoue
  'Service-Worker-Allowed': '/',
};

export default defineConfig({
  plugins: [
    htmlIncludePlugin(),
    viteOpenLocalIpPlugin(),
    ViteMinifyPlugin(),
    minifyManifestPlugin(),
    bundleSizePlugin(),
    assetManifestPlugin(),
    workerNoCachePlugin(),
    animPlugin(),
    // Lint + typecheck dans un worker thread séparé — zéro impact sur l'HMR.
    // enableBuild: false — `pnpm build` fait déjà tourner tsc, inutile de payer le check deux fois
    checker({
      typescript: true,
      eslint: { lintCommand: 'eslint .', useFlatConfig: true },
      enableBuild: false,
    }),
  ],
  server: {
    host: true,
    // Certs openssl maison (_dev/certs, gitignorés) plutôt que vite-plugin-mkcert : celui-ci
    // copiait le nom complet du compte macOS (Unicode "zalgo" avec octets invalides) dans le
    // subject du cert ET de la CA — Chrome tolère, Safari desktop/iOS rejette la connexion.
    // Régénération : voir _dev/certs/README.md. Trust : keychain macOS + simctl add-root-cert.
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '_dev/certs/dev-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '_dev/certs/dev-cert.pem')),
    },
    // cloudflared quick-tunnel (*.trycloudflare.com) n'est pas une IP LAN ni localhost —
    // Vite rejetterait la requête avec "This host is not allowed" sans cette entrée
    allowedHosts: ['.trycloudflare.com'],
    headers: crossOriginHeaders,
    // Les adresses .local (mDNS) ne sont pas résolues fiablement par les browsers pour les WebSockets
    hmr: { host: 'localhost', protocol: 'wss' },
  },
  preview: { headers: crossOriginHeaders },
  worker: { format: 'es' },
  // Babylon est déjà en ESM pur — le pre-bundler esbuild de Vite tree-shake des exports
  // du barrel @babylonjs/core/pure (ex: UniversalCamera, MeshBuilder) ce qui les rend undefined.
  // On exclut @babylonjs/core pour que Vite serve les fichiers originaux directement.
  optimizeDeps: {
    exclude: ['@babylonjs/core'],
  },
  resolve: {
    alias: {
      // @dev → src/_dev/ — pour les imports cross-dossiers dans _dev/
      '@dev': path.resolve(__dirname, 'src/_dev'),
    },
  },
});
