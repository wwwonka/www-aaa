// Démarre le thread de rendu : dimensionne le canvas, transfère son contrôle en OffscreenCanvas au
// render worker, spawn le worker (nommé selon le tier pour DevTools), l'initialise, et branche le
// miroir de survol UI (lu par le plein écran PWA desktop). Retourne les handles vivants du rendu.

import * as Comlink from 'comlink';
import type { RenderWorkerApi } from '../../render/render.worker';
import type { Tier } from './deviceBenchmark';

export interface RenderThread {
  /** Proxy Comlink du render worker (méthodes promisifiées). */
  readonly renderApi: Comlink.Remote<RenderWorkerApi>;
  readonly renderWorker: Worker;
  /** Le canvas (déjà transféré en offscreen) — pour brancher les handlers d'événements DOM. */
  readonly canvas: HTMLCanvasElement;
  /** Survol de l'UI de jeu (poussé par le worker) — lu synchroniquement par le handler PWA plein écran. */
  readonly isOverGameUI: () => boolean;
}

/**
 * @param tier - Profil de perf : en `low`, le worker de rendu héberge aussi la simulation (nom
 *   « Render+SimWorker » dans DevTools) ; sinon rendu seul.
 */
export async function startRenderThread(tier: Tier): Promise<RenderThread> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // Taille physique initiale avant le transfert — le worker n'a plus accès à `window` ensuite.
  const dpr = window.devicePixelRatio ?? 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  const offscreen = canvas.transferControlToOffscreen();

  const renderWorker = new Worker(new URL('../../render/render.worker.ts', import.meta.url), {
    type: 'module',
    name: tier === 'low' ? 'Render+SimWorker' : 'RenderWorker',
  });
  const renderApi = Comlink.wrap<RenderWorkerApi>(renderWorker);
  await renderApi.init(Comlink.transfer(offscreen, [offscreen]));

  // Miroir du survol UI poussé par le render worker — lu synchroniquement par le handler
  // dblclick→plein écran des PWA desktop (voir platform/pwa/AppWindowFullscreen.ts).
  let overGameUI = false;
  await renderApi.setOverGameUI(
    Comlink.proxy((over: boolean) => {
      overGameUI = over;
    }),
  );

  return { renderApi, renderWorker, canvas, isOverGameUI: () => overGameUI };
}
