import { disableContextMenu }      from './contextMenu'
import { disableKeyboardShortcuts } from './keyboardShortcuts'
import { disableTrackpadZoom }      from './trackpadZoom'

export function installBrowserGuards(): void {
  disableContextMenu()
  disableKeyboardShortcuts()
  disableTrackpadZoom()
}
