import { parseQueryFlags } from './app/platform/queryFlags';

if (import.meta.env.DEV) {
  const { installRemoteConsole } = await import('./_dev/remoteConsole');
  installRemoteConsole();
}

const flags = parseQueryFlags(window.location.search);

if (import.meta.env.DEV && flags.monolith) {
  const { startMonolithMode } = await import('./_dev/inspectors/monolith');
  await startMonolithMode();
} else {
  const { AppHost } = await import('./app/AppHost');
  const { assetsManager, renderApi } = await new AppHost().start(flags);

  if (import.meta.env.DEV) {
    const { initDevMode } = await import('./_dev/initDev');
    initDevMode({ assetsManager, renderApi });
  }
}
