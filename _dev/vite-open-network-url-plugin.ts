import { exec } from 'node:child_process'
import type { Plugin } from 'vite'

// Vite's default "o" shortcut opens `resolvedUrls.local[0]` (localhost)
// whenever `server.host` isn't a literal hostname string — see
// `getServerUrlByHost` in Vite's own openBrowser code, which only prefers a
// network URL if `host` matches it exactly. This project sets `host: true`
// (for LAN/phone access), so the default shortcut always falls back to
// localhost. Override the "o" key here to open the LAN URL instead, since
// that's the one actually useful for this project's phone/desktop testing
// workflow. Vite merges custom shortcuts ahead of its built-in ones by key
// (see `bindCLIShortcuts` in Vite's source), so this fully replaces the
// default "o" action rather than adding a second one.
export default function viteOpenNetworkUrlPlugin(): Plugin {
  return {
    name:  'vite-open-network-url-plugin',
    apply: 'serve',
    configureServer(server) {
      server.bindCLIShortcuts({
        customShortcuts: [
          {
            key:         'o',
            description: 'open the LAN URL in the browser',
            action() {
              const url = server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0]
              if (!url) {
                server.config.logger.warn('Aucune URL réseau résolue.')
                return
              }
              const opener =
                process.platform === 'darwin'  ? 'open'        :
                process.platform === 'win32'   ? 'start ""'    :
                                                 'xdg-open'
              exec(`${opener} "${url}"`, (err) => {
                if (err) server.config.logger.error(`open: ${err.message}`)
              })
            },
          },
        ],
      })
    },
  }
}
