import { parseQueryFlags } from './app/platform/queryFlags';
import { detectAppContext } from './app/platform/ContextManager';

if (import.meta.env.DEV) {
  const { installRemoteConsole } = await import('./_dev/remoteConsole');
  installRemoteConsole();
}

const flags = parseQueryFlags(window.location.search);

if (import.meta.env.DEV && flags.monolith) {
  const { startMonolithMode } = await import('./_dev/inspectors/monolith');
  await startMonolithMode();
} else {
  // Résolution de rôle AVANT de choisir le chunk à charger : un controller (URL `?r=CODE`
  // scannée depuis le QR d'un receiver, `?controller`, ou rôle persisté d'un device ambigu)
  // ne doit tirer que le shell DOM — jamais Babylon/Pixi/Havok (~4 Mo). Les flags explicites
  // gardent la priorité sur le `?r=` implicite.
  const impliedRole = flags.roomCode != null ? ('controller' as const) : null;
  const ctx = detectAppContext(flags.forcedRole ?? impliedRole);

  if (ctx.role === 'controller') {
    const { ControllerHost } = await import('./app/ControllerHost');
    new ControllerHost().start(flags, ctx);
  } else {
    const { AppHost } = await import('./app/AppHost');
    const { assetsManager, renderApi, inputHub, simControl } = await new AppHost().start(flags, ctx);

    if (import.meta.env.DEV) {
      const { initDevMode } = await import('./_dev/initDev');
      initDevMode({ assetsManager, renderApi, inputHub, simControl, flags });
    }
  }
}
