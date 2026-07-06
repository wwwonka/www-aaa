/**
 * Safari reports trackpad pinch via proprietary gesture events; Chrome/Firefox
 * report it as wheel+ctrlKey. Both must be blocked to prevent page zoom on
 * every desktop browser. desktop-chromium context also blocks wheel+ctrlKey
 * independently — the redundancy is intentional and harmless.
 */
export function disableTrackpadZoom(): void {
  const prevent = (e: Event) => e.preventDefault();
  window.addEventListener('gesturestart', prevent);
  window.addEventListener('gesturechange', prevent);
  window.addEventListener('gestureend', prevent);
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
}
