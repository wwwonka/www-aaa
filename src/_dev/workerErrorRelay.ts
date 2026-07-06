/**
 * DEV-only, importé statiquement EN PREMIER par les `.worker.ts` : relaie les erreurs du
 * WorkerGlobalScope vers `/__devlog` (voir `_dev/vite-devlog-plugin.ts`). Statique car un
 * import dynamique s'évaluerait après les autres imports — trop tard si l'un d'eux jette
 * pendant l'évaluation du graphe de modules (cas exact du crash Safari iOS). Le corps entier
 * est gardé par `import.meta.env.DEV` : no-op en build de prod.
 */

function relay(kind: string, detail: string): void {
  // fetch keepalive — sendBeacon n'existe pas dans un Worker
  void fetch('/__devlog', { method: 'POST', body: `[${kind}] ${detail}`, keepalive: true }).catch(
    () => {},
  );
}

if (import.meta.env.DEV) {
  const name = self.name || self.location.pathname;

  self.addEventListener('error', (e) => {
    relay(
      `worker:${name}`,
      `${e.message} @ ${e.filename}:${e.lineno}:${e.colno} ${e.error instanceof Error ? (e.error.stack ?? '') : ''}`,
    );
  });
  self.addEventListener('unhandledrejection', (e) => {
    const r: unknown = e.reason;
    relay(
      `worker:${name}:rejection`,
      r instanceof Error ? `${r.message}\n${r.stack ?? ''}` : String(r),
    );
  });

  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      relay(
        `worker:${name}:console.${level}`,
        args
          .map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : String(a)))
          .join(' '),
      );
    };
  }
}

export {};
