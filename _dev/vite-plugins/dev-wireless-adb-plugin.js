import { execFile } from 'node:child_process'

export const CHROME_PACKAGE = 'com.android.chrome'
export const DEVTOOLS_PORT = 9222
const WIRELESS_ADB_PORT = 5555

export const adb = (args, { timeout = 5000 } = {}) =>
  new Promise((resolve) => {
    const child = execFile('adb', args, { timeout }, (err, stdout) =>
      resolve({ ok: !err, stdout: stdout?.toString() ?? '' }),
    )
    child.on('error', () => resolve({ ok: false, stdout: '' }))
  })

const listDevices = async () => {
  const { stdout } = await adb(['devices'])
  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, state]) => id && state === 'device')
    .map(([id]) => id)
}

// Récupère l'IP WiFi du téléphone via une connexion USB existante.
const getWifiIp = async (serial) => {
  const { ok, stdout } = await adb(['-s', serial, 'shell', 'ip', '-f', 'inet', 'addr', 'show', 'wlan0'])
  if (!ok) return null
  const match = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/)
  return match?.[1] ?? null
}

// S'assure qu'un téléphone est joignable par adb en WiFi (débogage sans fil).
// Si seul un téléphone USB est branché, on bascule son adbd en TCP/IP et on
// s'y connecte automatiquement — pas besoin de saisir l'IP à la main.
export const ensurePhoneConnected = async (logger) => {
  const devices = await listDevices()
  const wireless = devices.find((id) => id.includes(':'))
  if (wireless) return wireless

  const usb = devices.find((id) => !id.includes(':'))
  if (!usb) {
    logger?.warn('Aucun téléphone détecté (ni USB ni WiFi). Branche-le en USB une fois pour activer le sans-fil.')
    return null
  }

  const ip = await getWifiIp(usb)
  if (!ip) {
    logger?.warn('Impossible de récupérer l\'IP WiFi du téléphone.')
    return null
  }

  await adb(['-s', usb, 'tcpip', String(WIRELESS_ADB_PORT)])
  const target = `${ip}:${WIRELESS_ADB_PORT}`
  const { ok } = await adb(['connect', target])
  if (!ok) {
    logger?.warn(`Connexion sans fil échouée vers ${target}.`)
    return null
  }
  logger?.info(`Connecté en WiFi à ${target}`)
  return target
}

// Ouvre l'URL sur le téléphone : si un onglet Chrome l'a déjà ouverte, on
// l'active (via le protocole DevTools) au lieu d'empiler un nouvel onglet.
export const openUrlOnPhone = async (server) => {
  const urls = server.resolvedUrls
  const url = urls?.network[0] ?? urls?.local[0]
  if (!url) {
    server.config.logger.warn('Aucune URL réseau résolue.')
    return
  }

  const phone = await ensurePhoneConnected(server.config.logger)
  if (!phone) return

  await adb(['forward', `tcp:${DEVTOOLS_PORT}`, 'localabstract:chrome_devtools_remote'])

  let tabs = []
  try {
    const res = await fetch(`http://localhost:${DEVTOOLS_PORT}/json`)
    tabs = await res.json()
  } catch {
    // Chrome DevTools non joignable (Chrome pas lancé sur le téléphone) : on
    // se contente d'ouvrir un nouvel onglet ci-dessous.
  }

  const existing = tabs.find((tab) => tab.type === 'page' && tab.url.startsWith(url))

  if (existing) {
    await fetch(`http://localhost:${DEVTOOLS_PORT}/json/activate/${existing.id}`)
    await adb(['shell', 'am', 'start', '-n', `${CHROME_PACKAGE}/com.google.android.apps.chrome.Main`])
    return
  }

  await adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url, '-n', `${CHROME_PACKAGE}/com.google.android.apps.chrome.Main`])
}

// Ajoute un raccourci CLI ("i") au serveur Vite : connecte le téléphone en
// WiFi si besoin, puis ouvre/rafraîchit l'URL dans son navigateur.
export default function wirelessAdbShortcut() {
  return {
    name: 'dev-wireless-adb-shortcut',
    apply: 'serve',
    configureServer(server) {
      server.bindCLIShortcuts({
        print: true,
        customShortcuts: [
          {
            key: 'i',
            description: 'connecter le téléphone en WiFi et ouvrir/rafraîchir l\'URL',
            async action() {
              await openUrlOnPhone(server)
            },
          },
        ],
      })
    },
  }
}
