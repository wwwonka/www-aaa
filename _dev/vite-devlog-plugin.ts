import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Reçoit les lignes postées par `src/_dev/remoteConsole.ts` (POST/beacon `/__devlog`) et les
 * écrit dans le terminal Vite + `_dev/.devlog` (gitignoré) — permet de lire les erreurs JS
 * d'un device distant (Safari iOS/simulator) sans Web Inspector.
 */
export default function devlogPlugin(): Plugin {
  return {
    name: 'devlog',
    apply: 'serve',
    configureServer(server) {
      const logFile = path.resolve(__dirname, '.devlog');
      server.middlewares.use('/__devlog', (req, res) => {
        let body = '';
        req.on('data', (chunk: Buffer) => (body += chunk.toString()));
        req.on('end', () => {
          const line = `${new Date().toISOString().slice(11, 19)} ${body}\n`;
          process.stdout.write(`[devlog] ${line}`);
          fs.appendFileSync(logFile, line);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}
