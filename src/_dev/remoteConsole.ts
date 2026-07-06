/**
 * DEV-only : relaie erreurs et console.warn/error de la page (et les erreurs remontées par les
 * Workers via leur event `error`) vers le serveur Vite (`/__devlog`, voir
 * `_dev/vite-devlog-plugin.ts`). Indispensable pour déboguer Safari iOS/simulator où l'accès à
 * la console est pénible. Importé tout en haut de `main.ts` sous `import.meta.env.DEV` pour
 * capturer les échecs de boot les plus précoces.
 */

function send(kind: string, parts: readonly unknown[]): void {
  const line = parts
    .map((p) => {
      if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack ?? ''}`;
      if (typeof p === 'object') {
        try {
          return JSON.stringify(p);
        } catch {
          return String(p);
        }
      }
      return String(p);
    })
    .join(' ');
  // sendBeacon: fiable même pendant un unload/crash de page, aucun await à gérer
  navigator.sendBeacon('/__devlog', `[${kind}] ${line}`);
}

export function installRemoteConsole(): void {
  window.addEventListener('error', (e) => {
    send('window.onerror', [e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error ?? '']);
  });
  window.addEventListener('unhandledrejection', (e) => {
    send('unhandledrejection', [e.reason]);
  });

  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      send(`console.${level}`, args);
    };
  }

  // Les events `error` d'un Worker ne remontent pas à window — on patche le constructeur pour
  // brancher un listener sur chaque Worker créé (dev only).
  const OriginalWorker = globalThis.Worker;
  globalThis.Worker = class extends OriginalWorker {
    constructor(...args: ConstructorParameters<typeof Worker>) {
      super(...args);
      const name = args[1]?.name ?? String(args[0]);
      this.addEventListener('error', (e) => {
        send('worker.error', [name, e.message, `${e.filename}:${e.lineno}:${e.colno}`]);
      });
    }
  };

  send('boot', [`page loaded ${location.href}`, navigator.userAgent]);
}
