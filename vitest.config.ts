import { defineConfig } from 'vitest/config';

// Config isolée (ne réutilise PAS `vite.config.ts` : ses plugins checker/minify n'ont aucun sens
// en test unitaire). Périmètre : logique pure du main thread — FSM de connexion, canal loopback.
// Le end-to-end reste à Playwright (`tests/**/*.spec.ts`, dans un vrai navigateur).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
