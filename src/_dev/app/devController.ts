// Bloc `?dev` sorti d'`AppHost` (zéro code dev dans le prod §13) : simule un controller connecté
// (débloque PLAY sans pairing), branche le clavier dev dans le hub d'input comme n'importe quelle
// source, et arme les touches C/R de snapshot. Appelé uniquement via `initDev`, sous `import.meta.env.DEV`.

import { appOrchestrator } from '../../core/AppOrchestrator';
import type { RenderWorkerApi } from '../../render/render.worker';
import type { InputHub } from '../../input/InputHub';
import type { SimControl } from '../../app/boot/simControl';
import type { QueryFlags } from '../../app/platform/queryFlags';
import { DevKeyboardSource } from '../input/DevKeyboardSource';

export async function initDevController(deps: {
  readonly flags: QueryFlags | undefined;
  readonly renderApi: RenderWorkerApi;
  readonly inputHub: InputHub;
  readonly simControl: SimControl;
}): Promise<void> {
  if (!deps.flags?.dev) return;

  // Controller simulé : débloque PLAY (garde `hasController` du Title) + prompt « DEV ».
  appOrchestrator.send({ type: 'CONTROLLER_CONNECTED' });
  void deps.renderApi.setControllerPaired('DEV');

  // Le clavier dev est une InputSource comme les autres → il emprunte le hub → SAB (pipeline prod),
  // pas un canal parallèle. Le hub le démarre s'il tourne déjà (en jeu).
  deps.inputHub.register(new DevKeyboardSource());

  // Touches C (capture) / R (restore) : round-trip de snapshot via la vraie surface Comlink.
  const { attachSnapshotDevKeys } = await import('../inspectors/simControls');
  attachSnapshotDevKeys(
    () => deps.simControl.capture(),
    (buf) => deps.simControl.restore(buf),
  );
}
