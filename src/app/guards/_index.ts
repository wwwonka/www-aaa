import { disableContextMenu } from './contextMenu';
import { disableKeyboardShortcuts } from './keyboardShortcuts';
import { disableTrackpadZoom } from './trackpadZoom';

/** Installs all browser guards that block native UI (context menu, shortcuts, pinch/ctrl-zoom) from interfering with the game. */
export function installBrowserGuards(): void {
  disableContextMenu();
  disableKeyboardShortcuts();
  disableTrackpadZoom();
}
