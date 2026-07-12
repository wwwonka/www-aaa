import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

// Le CA self-signed (openssl) sert d'ancre de confiance sur le device. process.cwd() = racine du
// projet (Vite s'y exécute), donc chemins robustes quel que soit le bundling ESM/CJS de la config.
const CERTS_DIR = path.resolve(process.cwd(), '_dev/certs');
const CA_PATH = path.join(CERTS_DIR, 'rootCA.pem');
const OPENSSL_CNF = path.join(CERTS_DIR, 'openssl.cnf');

const PAGE_PATH = '/cert';
const CA_PATH_URL = '/cert/rootCA.pem';

/** SANs (IP/DNS) déclarés dans openssl.cnf — pour le garde-fou « IP LAN absente du cert ». */
function certSans(): string[] {
  try {
    const cnf = readFileSync(OPENSSL_CNF, 'utf8');
    return [...cnf.matchAll(/^\s*(?:IP|DNS)\.\d+\s*=\s*(.+?)\s*$/gm)].map((m) => m[1]);
  } catch {
    return [];
  }
}

const PAGE_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Installer le certificat dev</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.5 -apple-system, system-ui, sans-serif; padding: 24px; max-width: 640px; margin-inline: auto; }
  h1 { font-size: 22px; }
  a.dl { display: block; text-align: center; background: #2563eb; color: #fff; text-decoration: none;
         padding: 16px; border-radius: 12px; font-weight: 600; margin: 20px 0; }
  section { border: 1px solid color-mix(in srgb, currentColor 20%, transparent); border-radius: 12px; padding: 16px; margin: 16px 0; }
  h2 { font-size: 17px; margin-top: 0; }
  ol { margin: 0; padding-left: 20px; }
  li { margin: 6px 0; }
  b { color: #2563eb; }
  .note { opacity: .7; font-size: 14px; }
</style>
</head>
<body>
<h1>Certificat de dev www-aaa</h1>
<p class="note">Installe ce certificat pour ouvrir <code>https://&lt;ip-lan&gt;</code> sans avertissement, y compris hors ligne.</p>
<a class="dl" href="${CA_PATH_URL}" download>⬇︎ Télécharger le certificat</a>

<section>
<h2>iPhone / iPad (iOS)</h2>
<ol>
<li>Appuie sur <b>Télécharger</b> ci-dessus, puis <b>Autoriser</b>.</li>
<li>Réglages → <b>Profil téléchargé</b> (en haut) → <b>Installer</b> (code requis).</li>
<li><b>Étape à ne pas oublier</b> : Réglages → Général → <b>Informations</b> → <b>Réglages de confiance des certificats</b> → active <b>la confiance totale</b> pour « www-aaa dev CA ».</li>
</ol>
</section>

<section>
<h2>Android</h2>
<ol>
<li>Appuie sur <b>Télécharger</b> ci-dessus.</li>
<li>Réglages → <b>Sécurité</b> → <b>Chiffrement et identifiants</b> → <b>Installer un certificat</b> → <b>Certificat CA</b> → choisis le fichier téléchargé.</li>
<li>Chrome/PWA font alors confiance au CA pour la navigation.</li>
</ol>
</section>
</body>
</html>`;

/** URL `/cert` en IP LAN — à ouvrir depuis le mobile pour installer le CA. */
function certPageUrl(server: ViteDevServer): string | null {
  const base = server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0];
  return base ? `${base.replace(/\/$/, '')}${PAGE_PATH}` : null;
}

/** Imprime l'URL d'install du cert (+ garde-fou SAN) à la demande — appelé par le raccourci `c`. */
function printCertUrl(server: ViteDevServer): void {
  const { logger } = server.config;
  const url = certPageUrl(server);
  if (url === null) {
    logger.warn('  Aucune URL réseau résolue (relance avec `host: true`).');
    return;
  }

  // Garde-fou : si l'IP LAN servie n'est pas dans les SANs du cert, la connexion sera rejetée même
  // après installation du CA → rappeler la régénération.
  const host = new URL(url).hostname;
  const sans = certSans();
  if (sans.length > 0 && !sans.includes(host)) {
    logger.warn(
      `  \x1b[33m⚠ ${host} absent des SANs du cert (${sans.join(', ')}) — ` +
        `ajoute-le dans _dev/certs/openssl.cnf et régénère (voir _dev/certs/README.md).\x1b[0m`,
    );
  }

  logger.info(
    `\n  \x1b[32m➜\x1b[0m  \x1b[1mCert mobile:\x1b[0m \x1b[36m${url}\x1b[0m  ` +
      `(ouvre sur ton tél. pour installer le CA)\n`,
  );
}

/**
 * Plugin dev : sert une page d'install du CA (`/cert`) + le CA lui-même (`/cert/rootCA.pem`, MIME
 * iOS-installable). L'URL n'est PAS affichée dans le bloc d'URLs par défaut de Vite — un raccourci
 * `c` l'imprime à la demande (écrase le `c` natif « clear console », assumé). Voir
 * `_dev/certs/README.md`. Uniquement en `serve` (dev).
 */
export default function viteCertInstallPlugin(): Plugin {
  return {
    name: 'vite-cert-install-plugin',
    apply: 'serve',
    configureServer(server) {
      // Ajouté AVANT les middlewares internes de Vite → `/cert` n'est pas capté par le fallback SPA.
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === CA_PATH_URL) {
          try {
            const ca = readFileSync(CA_PATH);
            // application/x-x509-ca-cert : déclenche l'installation de profil sur iOS.
            res.setHeader('Content-Type', 'application/x-x509-ca-cert');
            res.setHeader('Content-Disposition', 'attachment; filename="www-aaa-dev-CA.pem"');
            res.end(ca);
          } catch {
            res.statusCode = 500;
            res.end('rootCA.pem introuvable — voir _dev/certs/README.md');
          }
          return;
        }
        if (url === PAGE_PATH || url === `${PAGE_PATH}/`) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(PAGE_HTML);
          return;
        }
        next();
      });

      // bindCLIShortcuts fusionne les raccourcis entre appels (dedup par touche) — coexiste donc
      // avec le `o`/`b` de vite-open-local-ip-plugin ; notre `c` prime sur le natif.
      server.bindCLIShortcuts({
        customShortcuts: [
          {
            key: 'c',
            description: 'show the mobile cert-install URL',
            action: (s) => printCertUrl(s),
          },
        ],
      });
    },
  };
}
