# turn-credentials — Worker Cloudflare (STUN/TURN éphémère)

Émet des credentials **TURN Cloudflare Realtime** courts, consommés par l'app au runtime
(`src/input/signaling/iceServers.ts`). Le secret long-terme reste côté Worker — jamais dans le
bundle client. Cloudflare renvoie **STUN + TURN** dans la même liste `iceServers` (pas de STUN
séparé à monter).

## Pourquoi

Sans STUN/TURN, le canal WebRTC de pairing n'aboutit que sur le même réseau. STUN débloque la
plupart des réseaux différents ; TURN (relais) couvre les NAT symétriques / firewalls stricts.

## Setup (à faire par toi — rien à committer)

1. Dashboard Cloudflare → **Realtime → TURN** → créer une clé → noter le **Token ID** et l'**API token**.
2. Poser les secrets :
   ```sh
   cd infra/turn-credentials
   npx wrangler secret put TURN_TOKEN_ID
   npx wrangler secret put TURN_API_TOKEN
   ```
3. Déployer :
   ```sh
   npx wrangler deploy
   ```
4. Copier l'URL du Worker déployé dans l'app, via un fichier `.env` (non committé) à la racine :
   ```
   VITE_TURN_CREDENTIALS_URL=https://turn-credentials.<ton-subdomain>.workers.dev
   ```

Sans `VITE_TURN_CREDENTIALS_URL`, l'app retombe automatiquement sur STUN public gratuit
(même-LAN + une partie du cross-réseau OK ; NAT symétrique KO). Aucune régression tant que ce
n'est pas provisionné.

## Endpoint

`GET /` → `{ "iceServers": [ { "urls": [...], "username": "...", "credential": "..." } ] }`
