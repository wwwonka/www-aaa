// Cloudflare Worker — émet des credentials TURN Cloudflare Realtime ÉPHÉMÈRES à la demande.
//
// Pourquoi un Worker : le secret long-terme (Turn Token ID + API token) ne doit JAMAIS finir dans
// le bundle client. Le Worker le détient (Worker Secrets) et frappe des credentials courts que le
// front va chercher au runtime (voir `src/input/signaling/iceServers.ts`, via
// `VITE_TURN_CREDENTIALS_URL`). Cloudflare renvoie STUN + TURN dans la même liste `iceServers`.
//
// Provisionnement (côté utilisateur — rien à committer) :
//   1. Dashboard Cloudflare → Realtime → TURN → créer une clé → noter Token ID + API token.
//   2. `wrangler secret put TURN_TOKEN_ID`
//   3. `wrangler secret put TURN_API_TOKEN`
//   4. `wrangler deploy`  → l'URL du Worker va dans `VITE_TURN_CREDENTIALS_URL` de l'app.

const CF_TURN_TTL_SECONDS = 86_400; // 24 h — largement au-delà d'une session de jeu.

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN ?? '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, cors);
    }
    if (!env.TURN_TOKEN_ID || !env.TURN_API_TOKEN) {
      return json({ error: 'TURN non configuré (secrets manquants)' }, 500, cors);
    }

    const upstream = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_TOKEN_ID}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: CF_TURN_TTL_SECONDS }),
      },
    );
    if (!upstream.ok) {
      return json({ error: 'upstream Cloudflare', status: upstream.status }, 502, cors);
    }

    const data = await upstream.json();
    // Cloudflare renvoie `iceServers` en objet unique ; le client attend un tableau.
    const iceServers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    return json({ iceServers }, 200, { ...cors, 'Cache-Control': 'no-store' });
  },
};

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
