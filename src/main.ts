if (import.meta.env.DEV && window.location.search.includes('monolith')) {
  const { startMonolithMode } = await import('./_dev/inspectors/monolith');
  await startMonolithMode();
} else {
  const { AppHost } = await import('./app/AppHost');
  const { assetsManager, renderApi } = await new AppHost().start();

  // Load DEV MODE
  if (import.meta.env.DEV) {
    const { initDev } = await import('./_dev/initDev');
    initDev({ assetsManager, renderApi });
  }
}
