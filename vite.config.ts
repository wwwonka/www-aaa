import {defineConfig} from "vite";
import path from "node:path";
import mkcert from "vite-plugin-mkcert";
import viteOpenLocalIpPlugin, {
	bonjourHost,
} from "./_dev/vite-open-local-ip-plugin";
import htmlIncludePlugin from "./_dev/vite-html-include-plugin.ts";
import {ViteMinifyPlugin} from "vite-plugin-minify";
import minifyManifestPlugin from "./_dev/vite-minify-manifest-plugin.ts";
import { bundleSizePlugin }  from "./_dev/vite-bundle-size-plugin.ts";
import assetManifestPlugin  from "./_dev/vite-asset-manifest-plugin.ts";
import workerNoCachePlugin  from "./_dev/vite-worker-no-cache-plugin.ts";

// COEP 'require-corp' est requis pour SharedArrayBuffer
// Safari exige en plus CORP sur chaque ressource servie — sans ça les imports worker sont bloqués
const crossOriginHeaders = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
	"Cross-Origin-Resource-Policy": "same-origin",
	// serviceWorker.ts vit dans src/app/platform/ — sans cet en-tête, le scope max autorisé
	// par le navigateur est borné à ce dossier et register(..., { scope: '/' }) échoue
	"Service-Worker-Allowed": "/",
};

export default defineConfig({
	plugins: [
		htmlIncludePlugin(),
		mkcert({savePath: "./_dev/.mkcert", hosts: [bonjourHost]}),
		viteOpenLocalIpPlugin(),
		ViteMinifyPlugin(),
		minifyManifestPlugin(),
		bundleSizePlugin(),
		assetManifestPlugin(),
		workerNoCachePlugin(),
	],
	server: {
		host: true,
		https: true,
		// cloudflared quick-tunnel (*.trycloudflare.com) n'est pas une IP LAN ni localhost —
		// Vite rejetterait la requête avec "This host is not allowed" sans cette entrée
		allowedHosts: [".trycloudflare.com"],
		headers: crossOriginHeaders,
		// Les adresses .local (mDNS) ne sont pas résolues fiablement par les browsers pour les WebSockets
		hmr: {host: "localhost", protocol: "wss"},
	},
	preview: {headers: crossOriginHeaders},
	worker: {format: "es"},
	// Babylon est déjà en ESM pur — le pre-bundler esbuild de Vite tree-shake des exports
	// du barrel @babylonjs/core/pure (ex: UniversalCamera, MeshBuilder) ce qui les rend undefined.
	// On exclut @babylonjs/core pour que Vite serve les fichiers originaux directement.
	optimizeDeps: {
		exclude: ["@babylonjs/core"],
	},
	resolve: {
		alias: {
			// @dev → src/_dev/ — pour les imports cross-dossiers dans _dev/
			"@dev": path.resolve(__dirname, "src/_dev"),
		},
	},
});
