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

let cached: readonly RTCIceServer[] | null = null;

/**
 * Liste `iceServers` pour `RTCPeerConnection`, mise en cache pour la session. Tente les
 * credentials Cloudflare éphémères si `VITE_TURN_CREDENTIALS_URL` est défini, sinon (ou en cas
 * d'échec) retombe sur STUN public. Ne rejette jamais — la connectivité dégrade, elle ne casse pas.
 */
export async function getIceServers(): Promise<readonly RTCIceServer[]> {
  if (cached !== null) return cached;

  const endpoint = import.meta.env.VITE_TURN_CREDENTIALS_URL as string | undefined;
  if (endpoint === undefined || endpoint === '') return (cached = PUBLIC_STUN);

  try {
    const res = await fetch(endpoint, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: unknown = await res.json();
    const servers = (data as { iceServers?: unknown }).iceServers;
    if (!Array.isArray(servers) || servers.length === 0) throw new Error('réponse sans iceServers');
    return (cached = servers as RTCIceServer[]);
  } catch (err) {
    console.warn('[iceServers] credentials TURN indisponibles, fallback STUN public —', err);
    return (cached = PUBLIC_STUN);
  }
}
