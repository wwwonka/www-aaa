import { detectRuntimeContext, type RuntimeCategory } from './runtimeDetect'

export type DevicePlatform = 'mobile' | 'desktop' | 'ambiguous'
export type DeviceRole     = 'controller' | 'receiver' | 'unknown'

export interface AppContext {
  platform: DevicePlatform
  role:     DeviceRole
  runtime:  RuntimeCategory
}

const ROLE_KEY = 'device-role'

function detectPlatform(ua: string, runtime: RuntimeCategory): DevicePlatform {
  // PWA installée — runtime est autoritatif
  if (runtime === 'pwa-mobile-ios' || runtime === 'pwa-mobile-android') return 'mobile'
  if (runtime === 'pwa-desktop-chromium' || runtime === 'pwa-desktop-firefox' || runtime === 'pwa-desktop-safari') return 'desktop'

  // Browser tab — on se rabat sur UA + touch
  const clearlyMobile  = /Mobi|Android|iPhone/.test(ua)
  const clearlyDesktop = navigator.maxTouchPoints === 0 && !/Mobi|Android|iPhone|iPad/.test(ua)

  if (clearlyMobile)  return 'mobile'
  if (clearlyDesktop) return 'desktop'
  return 'ambiguous'  // iPad browser, laptop tactile, etc.
}

function roleFromPlatform(platform: DevicePlatform): DeviceRole {
  if (platform === 'mobile')  return 'controller'
  if (platform === 'desktop') return 'receiver'
  return localStorage.getItem(ROLE_KEY) as DeviceRole | null ?? 'unknown'
}

export function saveRole(role: 'controller' | 'receiver'): void {
  localStorage.setItem(ROLE_KEY, role)
}

export function detectAppContext(): AppContext {
  const { category: runtime } = detectRuntimeContext()
  const platform = detectPlatform(navigator.userAgent, runtime)
  const role     = roleFromPlatform(platform)

  return { platform, role, runtime }
}
