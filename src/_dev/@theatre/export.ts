import { getSaveFileContent } from './studio'
import { scenarios } from './scenarios/_index'
import type { TheatreOnDiskState } from '../assets/theatreState'

const PROJECT_ID = 'GameUI'

/**
 * Cmd/Ctrl+S while Studio is open — writes every declared scenario's sheet to
 * `public/game/anim/<fileName>.anim.json` via the dev server's save middleware
 * (`_dev/vite-anim-plugin.ts`). No guessing which sheet is "currently active": every registered
 * scenario is small and cheap to write, so all of them are exported every time.
 */
export async function exportScenarios(): Promise<void> {
  const state = getSaveFileContent(PROJECT_ID) as unknown as TheatreOnDiskState

  await Promise.all(scenarios.map(async scenario => {
    const sheet = state.sheetsById[scenario.sheetName]
    if (!sheet) return

    // Un seul sheet par fichier, mais toujours sous `sheetsById` — même forme que ce que
    // `JsonAnimationLoader.ts`/`theatreState.ts` attendent (et que l'export déjà présent sur disque).
    const payload: TheatreOnDiskState = { sheetsById: { [scenario.sheetName]: sheet } }

    const response = await fetch(`/__save-anim/${scenario.fileName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload, null, 2),
    })
    if (!response.ok) console.error(`[export] failed to save "${scenario.fileName}.anim.json" (${response.status})`)
    else console.info(`[export] saved public/game/anim/${scenario.fileName}.anim.json`)
  }))
}
