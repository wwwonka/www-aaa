import { spawn } from 'node:child_process'

// Quick cloudflared tunnel prints its assigned hostname to stderr, e.g.:
// "https://some-random-words.trycloudflare.com"
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

// Starts `cloudflared tunnel --url <local dev server>` automatically when
// the dev server boots, and serves the resulting public URL at
// /__dev/tunnel-url so the frontend (src/_dev/external-access.js) can read
// it without the developer having to copy/paste anything. This is what lets
// the pairing QR code point at a real public address — a phone on cellular
// data can't reach a 192.168.x.x LAN address, so testing pairing across two
// genuinely different networks needs an actual public tunnel, not just a
// frontend toggle.
export default function tunnelPlugin() {
  let tunnelUrl = null
  let child = null

  const startTunnel = (server) => {
    const address = server.httpServer?.address()
    const port = typeof address === 'object' && address ? address.port : 5173
    const localUrl = `https://localhost:${port}`

    child = spawn('cloudflared', ['tunnel', '--url', localUrl], { stdio: ['ignore', 'pipe', 'pipe'] })

    const onData = (data) => {
      const match = data.toString().match(TUNNEL_URL_RE)
      if (match && !tunnelUrl) {
        tunnelUrl = match[0]
        server.config.logger.info(`\n  \x1b[36m➜\x1b[0m  \x1b[1mPublic tunnel:\x1b[0m  ${tunnelUrl}\n`)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', (err) => {
      server.config.logger.warn(`dev-tunnel: cloudflared failed to start (${err.message}) — is it installed? "brew install cloudflared"`)
    })
  }

  return {
    name: 'dev-tunnel',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/tunnel-url', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ url: tunnelUrl }))
      })

      server.httpServer?.once('listening', () => startTunnel(server))

      server.bindCLIShortcuts({
        customShortcuts: [
          {
            key: 't',
            description: 'show public tunnel URL',
            action() {
              server.config.logger.info(tunnelUrl ? `Public tunnel: ${tunnelUrl}` : 'Tunnel not ready yet…')
            },
          },
        ],
      })

      const stop = () => child?.kill()
      process.once('exit', stop)
      process.once('SIGTERM', stop)
      process.once('SIGINT', stop)
    },
  }
}
