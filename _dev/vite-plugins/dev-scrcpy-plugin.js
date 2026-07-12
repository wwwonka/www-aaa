import { execFile, spawn } from 'node:child_process'

const focusScrcpy = () => {
  if (process.platform !== 'darwin') return
  spawn(
    'osascript',
    ['-e', 'tell application "System Events" to set frontmost of process "scrcpy" to true'],
    { stdio: 'ignore' },
  )
}

const isScrcpyRunning = () =>
  new Promise((resolve) => {
    execFile('pgrep', ['-x', 'scrcpy'], (err) => resolve(!err))
  })

const CHROME_PACKAGE = 'com.android.chrome'
const DEVTOOLS_PORT = 9222

const adb = (args) =>
  new Promise((resolve) => {
    execFile('adb', args, (err, stdout) => resolve({ ok: !err, stdout }))
  })

// Ouvre l'URL sur le téléphone : si un onglet Chrome l'a déjà ouverte, on
// l'active (via le protocole DevTools) au lieu d'empiler un nouvel onglet.
const openUrlOnPhone = async (server) => {
  const urls = server.resolvedUrls
  const url = urls?.network[0] ?? urls?.local[0]
  if (!url) {
    server.config.logger.warn('Aucune URL réseau résolue.')
    return
  }

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

// Ajoute un raccourci CLI (touche "p") au serveur Vite :
// lance scrcpy (ou l'amène au premier plan si déjà ouvert) et ouvre l'URL du
// serveur dans le navigateur du téléphone (via adb), en réutilisant l'onglet
// existant s'il y en a un.
export default function scrcpyShortcut() {
  return {
    name: 'dev-scrcpy-shortcut',
    apply: 'serve',
    configureServer(server) {
      server.bindCLIShortcuts({
        print: true,
        customShortcuts: [
          {
            key: 'p',
            description: 'scrcpy + ouvrir l\'URL sur le téléphone (réutilise l\'onglet)',
            async action() {
              await openUrlOnPhone(server)

              if (await isScrcpyRunning()) {
                focusScrcpy()
                return
              }

              const args = [
                '--disable-screensaver',
                '--show-touches',
                '--stay-awake',
                '--video-codec=h264',
                '--video-bit-rate=16M',
                '--audio-bit-rate=128K',
                '--max-fps=60',
              ]
              const child = spawn('scrcpy', args, { stdio: 'ignore', detached: true })
              child.unref()
              child.on('error', (err) => {
                server.config.logger.error(`scrcpy: ${err.message}`)
              })

              // Amène la fenêtre scrcpy au premier plan une fois ouverte.
              setTimeout(focusScrcpy, 1000)
            },
          },
        ],
      })
    },
  }
}
