export type RuntimeCategory =
  | 'browser-tab'
  | 'pwa-desktop-chromium'
  | 'pwa-desktop-firefox'
  | 'pwa-desktop-safari'
  | 'pwa-mobile-ios'
  | 'pwa-mobile-android'

export interface RuntimeContext {
  category: RuntimeCategory
}

function detectBrowserName(ua: string): string {
  if (/Firefox/.test(ua))                                      return 'Firefox'
  if (/Edg\//.test(ua))                                        return 'Edge'
  if (/OPR\/|Opera/.test(ua))                                  return 'Opera'
  if (/Chrome|Chromium|CriOS/.test(ua))                        return 'Chrome'
  if (/Safari/.test(ua) && !/Chrome|Chromium/.test(ua))        return 'Safari'
  return 'Unknown'
}

const CATEGORY_LABELS: Record<RuntimeCategory, string> = {
  'browser-tab':          'Browser Tab',
  'pwa-desktop-chromium': 'PWA Chromium (Desktop)',
  'pwa-desktop-firefox':  'PWA Firefox (Desktop)',
  'pwa-desktop-safari':   'PWA Safari (Desktop)',
  'pwa-mobile-ios':       'PWA iOS (Mobile)',
  'pwa-mobile-android':   'PWA Android (Mobile)',
}

export function detectRuntimeContext(): RuntimeContext {
  const ua = navigator.userAgent

  const signals = {
    'display-mode: browser':                  matchMedia('(display-mode: browser)').matches,
    'display-mode: standalone':               matchMedia('(display-mode: standalone)').matches,
    'display-mode: window-controls-overlay':  matchMedia('(display-mode: window-controls-overlay)').matches,
    'navigator.standalone (iOS)':             (navigator as any).standalone === true,
    "'windowControlsOverlay' in navigator":   'windowControlsOverlay' in navigator,
    'UA: Chromium (desktop)':                 /Chrome|Chromium|Edg|OPR/.test(ua) && !/Android|iPhone|iPad|CriOS/.test(ua),
    'UA: Firefox':                            /Firefox/.test(ua),
    'UA: Safari (desktop)':                   /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR/.test(ua),
    'UA: Chrome (mobile)':                    /CriOS|Chrome/.test(ua) && /Android|iPhone|iPad/.test(ua),
    'UA: Android':                            /Android/.test(ua),
    'UA: iPhone/iPad':                        /iPhone|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
  }

  const isInstalled = !signals['display-mode: browser'] || signals['navigator.standalone (iOS)']

  let category: RuntimeCategory = 'browser-tab'
  if (isInstalled) {
    if (signals["'windowControlsOverlay' in navigator"]) {
      category = 'pwa-desktop-chromium'
    } else if (signals['UA: iPhone/iPad']) {
      category = 'pwa-mobile-ios'
    } else if (signals['UA: Android']) {
      category = 'pwa-mobile-android'
    } else if (signals['UA: Firefox']) {
      category = 'pwa-desktop-firefox'
    } else if (signals['UA: Safari (desktop)']) {
      category = 'pwa-desktop-safari'
    }
  }

  if (import.meta.env.DEV) {
    // Dynamic import — logger is never bundled in prod
    import('../../_dev/logger').then(({ createGroupLogger }) => {
      const log = createGroupLogger('runtime-context', '#e8590c')
      const nameWidth = Math.max(...Object.keys({ isInstalled, ...signals }).map((k) => k.length))
      const label = category === 'browser-tab'
        ? `Browser Tab (${detectBrowserName(ua)})`
        : CATEGORY_LABELS[category]
      log.group(label)
      for (const [name, value] of Object.entries({ isInstalled, ...signals })) {
        log.row(name, value, nameWidth)
      }
      log.groupEnd()
    })
  }

  return { category }
}
