// Résolution des serveurs ICE (STUN/TURN) pour la traversée NAT du canal WebRTC de pairing.
//
// Sans STUN/TURN, une connexion directe n'aboutit que sur le même LAN. STUN (miroir d'adresse
// publique) débloque la majorité des réseaux différents ; TURN (relais) couvre les NAT
// symétriques / firewalls stricts. Cloudflare Realtime fournit les DEUX dans une seule liste
// `iceServers`, via des credentials ÉPHÉMÈRES frappés côté serveur (jamais le secret dans le
// bundle) — voir `infra/turn-credentials/`. On configure l'endpoint via `VITE_TURN_CREDENTIALS_URL`.
//
// Fallback si l'endpoint est absent ou injoignable : STUN public gratuit (aucun relais → les NAT
// symétriques échoueront, mais le même-LAN et une bonne part du cross-réseau passent).

const PUBLIC_STUN: readonly RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

// Les credentials TURN Cloudflare sont ÉPHÉMÈRES (frappés côté serveur). Un cache éternel finirait
// par servir des creds expirés à une reconnexion tardive (lock-screen, RETRY après 1 h). TTL 30 min
// < durée de vie typique des creds → chaque rejoin dispose de creds frais, et un endpoint tombé se
// re-tente au lieu de rester bloqué sur un vieux fallback STUN.
const ICE_TTL_MS = 30 * 60 * 1000;
// Le fetch des creds est sur le chemin critique du join : on ne l'attend pas indéfiniment. 4 s puis
// fallback STUN — mieux vaut un pairing dégradé (même-LAN) qu'un spinner éternel.
const ICE_FETCH_TIMEOUT_MS = 4000;

let cached: readonly RTCIceServer[] | null = null;
let cachedAt = 0;

/**
 * Liste `iceServers` pour `RTCPeerConnection`, mise en cache avec TTL (30 min — les creds TURN
 * expirent). Tente les credentials Cloudflare éphémères si `VITE_TURN_CREDENTIALS_URL` est défini
 * (avec timeout de 4 s), sinon (ou en cas d'échec/timeout) retombe sur STUN public. Ne rejette
 * jamais — la connectivité dégrade, elle ne casse pas.
 */
export async function getIceServers(): Promise<readonly RTCIceServer[]> {
  if (cached !== null && Date.now() - cachedAt < ICE_TTL_MS) return cached;

  const store = (servers: readonly RTCIceServer[]): readonly RTCIceServer[] => {
    cached = servers;
    cachedAt = Date.now();
    return servers;
  };

  const endpoint = import.meta.env.VITE_TURN_CREDENTIALS_URL as string | undefined;
  if (endpoint === undefined || endpoint === '') return store(PUBLIC_STUN);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(ICE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    const servers = (data as { iceServers?: unknown }).iceServers;
    if (!Array.isArray(servers) || servers.length === 0) throw new Error('réponse sans iceServers');
    return store(servers as RTCIceServer[]);
  } catch (err) {
    console.warn('[iceServers] credentials TURN indisponibles, fallback STUN public —', err);
    return store(PUBLIC_STUN);
  }
}
