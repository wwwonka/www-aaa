import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mintTurnIceServers } from '../shared/turn-credentials.js'

const SECRETS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '.turn-secrets.json')

// Local-dev mirror of worker/index.js's /api/turn-credentials route, so
// `pnpm dev` behaves the same as production. The TURN key/token are read
// from dev/.turn-secrets.json (gitignored, never committed — see
// dev/.turn-secrets.json.example) and never leave this Node process; the
// client only ever receives the short-lived iceServers Cloudflare hands back.
// If the secrets file doesn't exist yet, the route just returns an empty
// list and src/pairing/online.js falls back to its static TURN config.
export default function turnCredentialsPlugin() {
  return {
    name: 'dev-turn-credentials',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/turn-credentials', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (!existsSync(SECRETS_PATH)) {
          res.end(JSON.stringify({ iceServers: [] }))
          return
        }

        let turnKeyId, turnApiToken
        try {
          ({ turnKeyId, turnApiToken } = JSON.parse(readFileSync(SECRETS_PATH, 'utf-8')))
        } catch (err) {
          server.config.logger.warn(`dev-turn-credentials: ${err.message}`)
          res.end(JSON.stringify({ iceServers: [] }))
          return
        }

        const iceServers = await mintTurnIceServers(turnKeyId, turnApiToken)
        res.end(JSON.stringify({ iceServers }))
      })
    },
  }
}
