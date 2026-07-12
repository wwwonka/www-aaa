import { exec } from 'node:child_process';
import { hostname } from 'node:os';
import type { Plugin } from 'vite';

// os.hostname() already returns 'MacBook.local' on macOS — guard against
// systems where it doesn't to avoid producing 'host.local.local'.
const rawHost = hostname();
export const bonjourHost = rawHost.endsWith('.local') ? rawHost : `${rawHost}.local`;

function openUrl(url: string, logger: { error: (msg: string) => void }) {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${opener} "${url}"`, (err) => {
    if (err) logger.error(`open: ${err.message}`);
  });
}

export default function viteOpenLocalIpPlugin(): Plugin {
  return {
    name: 'vite-open-local-ip-plugin',
    apply: 'serve',
    configureServer(server) {
      // Inject a Bonjour line into Vite's startup URL block.
      // mkcert adds bonjourHost to resolvedUrls.local which Vite would print
      // as a duplicate "Local:" entry — filter it out before calling the
      // original printUrls, then append our own styled "Bonjour:" line.
      const _printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        if (server.resolvedUrls) {
          server.resolvedUrls.local = server.resolvedUrls.local.filter(
            (u) => !u.includes(bonjourHost),
          );
        }
        _printUrls();
        const networkUrl = server.resolvedUrls?.network?.[0];
        const port = networkUrl ? new URL(networkUrl).port : '5173';
        const url = `https://${bonjourHost}${port ? `:${port}` : ''}/`;
        server.config.logger.info(
          `  \x1b[32m➜\x1b[0m  \x1b[1mBonjour:\x1b[0m \x1b[36m${url}\x1b[0m`,
        );
      };

      server.bindCLIShortcuts({
        customShortcuts: [
          {
            key: 'o',
            description: 'open the LAN IP URL in the browser',
            action() {
              const url = server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0];
              if (!url) {
                server.config.logger.warn('No network URL resolved.');
                return;
              }
              openUrl(url, server.config.logger);
            },
          },
          {
            key: 'b',
            description: `open the Bonjour URL (${bonjourHost}) in the browser`,
            action() {
              const networkUrl = server.resolvedUrls?.network?.[0];
              if (!networkUrl) {
                server.config.logger.warn('No network URL resolved.');
                return;
              }
              const port = new URL(networkUrl).port;
              const url = `https://${bonjourHost}${port ? `:${port}` : ''}/`;
              openUrl(url, server.config.logger);
            },
          },
        ],
      });
    },
  };
}
