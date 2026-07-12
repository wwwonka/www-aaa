// Dev sur téléphone physique SANS installer de certificat : lance Vite (port fixe) + un
// cloudflared quick-tunnel, et surface l'URL publique `*.trycloudflare.com` (cert réel, trusté
// partout). Ouvre cette URL sur l'iPhone/Android — aucun profil/CA à installer.
//
//   pnpm dev:tunnel
//
// Le tunnel parle à l'origine HTTPS locale (certs self-signed de _dev/certs) via --no-tls-verify ;
// le côté public, lui, sert un vrai cert Cloudflare. `allowedHosts: ['.trycloudflare.com']` est
// déjà dans vite.config.ts.

import { spawn } from 'node:child_process';

const PORT = 5173;
const children = [];
const kill = () => {
  for (const c of children) c.kill('SIGTERM');
};
process.on('SIGINT', () => {
  kill();
  process.exit(0);
});
process.on('exit', kill);

// 1) Vite sur un port FIXE (le tunnel a besoin d'une cible stable).
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' });
children.push(vite);
vite.on('exit', (code) => {
  console.error(
    `\n[dev-tunnel] Vite s'est arrêté (code ${code}). Le port ${PORT} est peut-être déjà pris.`,
  );
  kill();
  process.exit(code ?? 1);
});

// 2) cloudflared, après un court délai le temps que Vite écoute.
setTimeout(() => {
  const cf = spawn(
    'cloudflared',
    ['tunnel', '--url', `https://localhost:${PORT}`, '--no-tls-verify'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  children.push(cf);

  let announced = false;
  const scan = (buf) => {
    const text = buf.toString();
    process.stderr.write(text);
    if (announced) return;
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      announced = true;
      console.log(
        `\n\n📱  Ouvre cette URL sur ton téléphone (aucun certificat à installer) :\n\n     ${m[0]}\n\n`,
      );
    }
  };
  cf.stdout.on('data', scan);
  cf.stderr.on('data', scan);
  cf.on('exit', (code) => {
    console.error(`\n[dev-tunnel] cloudflared s'est arrêté (code ${code}).`);
    kill();
    process.exit(code ?? 1);
  });
}, 3500);
