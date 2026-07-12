import { detectRuntimeContext, type RuntimeCategory } from './runtimeDetect';

export type DevicePlatform = 'mobile' | 'desktop' | 'ambiguous';
export type DeviceRole = 'controller' | 'receiver' | 'unknown';

/** Résultat combiné de la détection plateforme + runtime + rôle pour cet appareil. */
export interface AppContext {
  platform: DevicePlatform;
  role: DeviceRole;
  runtime: RuntimeCategory;
}

const ROLE_KEY = 'device-role';

function detectPlatform(ua: string, runtime: RuntimeCategory): DevicePlatform {
  // PWA installée — runtime est autoritatif
  if (runtime === 'pwa-mobile-ios' || runtime === 'pwa-mobile-android') return 'mobile';
  if (
    runtime === 'pwa-desktop-chromium' ||
    runtime === 'pwa-desktop-firefox' ||
    runtime === 'pwa-desktop-safari'
  )
    return 'desktop';

  // Browser tab — on se rabat sur UA + touch
  const clearlyMobile = /Mobi|Android|iPhone/.test(ua);
  const clearlyDesktop = navigator.maxTouchPoints === 0 && !/Mobi|Android|iPhone|iPad/.test(ua);

  if (clearlyMobile) return 'mobile';
  if (clearlyDesktop) return 'desktop';
  return 'ambiguous'; // iPad browser, laptop tactile, etc.
}

function roleFromPlatform(platform: DevicePlatform): DeviceRole {
  // Mobile en URL de base = un receiver « self-controlled » : il affiche le jeu ET se pilote avec
  // ses joysticks tactiles locaux (voir `selfControlled` dans AppHost). Il ne devient controller
  // QUE via un flag explicite (`?controller` / `?r=` d'un QR scanné) — jamais par simple UA, sinon
  // tout mobile sauterait en pairing plein écran au boot (bug corrigé).
  if (platform === 'mobile' || platform === 'desktop') return 'receiver';
  return (localStorage.getItem(ROLE_KEY) as DeviceRole | null) ?? 'unknown';
}

/** Persiste le rôle choisi par l'utilisateur pour un appareil 'ambiguous' (ex: iPad). */
export function saveRole(role: 'controller' | 'receiver'): void {
  localStorage.setItem(ROLE_KEY, role);
}

/**
 * Détecte plateforme, rôle et runtime de l'appareil courant.
 *
 * @param forcedRole - Override session-only (`?controller` / `?receiver`) — prioritaire sur la
 * détection, jamais persisté (localStorage reste réservé au choix manuel via {@link saveRole}).
 */
export function detectAppContext(forcedRole?: 'controller' | 'receiver' | null): AppContext {
  const { category: runtime } = detectRuntimeContext();
  const platform = detectPlatform(navigator.userAgent, runtime);
  const role = forcedRole ?? roleFromPlatform(platform);

  return { platform, role, runtime };
}
