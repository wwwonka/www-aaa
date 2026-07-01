import { getProject, types } from '@theatre/core'
import type { AppOrchestrator } from '../../../core/AppOrchestrator'
import { initStudio } from '../studio'
import { scenarios } from '../scenarios/_index'
import type { AnimationObject } from '../scenarios/types'

/** Builds Theatre object props, applying each prop's range (e.g. `[0, 1]` for a fade) when declared. */
function buildProps(object: AnimationObject): Record<string, ReturnType<typeof types.number> | number> {
  return Object.fromEntries(
    Object.entries(object.defaults).map(([key, value]) => {
      const range = object.ranges?.[key]
      return [key, range ? types.number(value, { range: [...range] }) : value]
    }),
  )
}

/**
 * Wires every declared scenario to a Theatre.js sheet, DEV-only, main thread. Each scenario can
 * animate several subcomponents of a screen independently (one Theatre object per subcomponent,
 * same sheet/timeline) — every numeric prop of every object is pushed to the render worker via
 * `applyAnimatedValue(` `${objectKey}.${propKey}` `, value)` (Comlink), matching the id each
 * subcomponent registered itself under via `registerAnimatable()`. Plays a scenario's sequence
 * when the orchestrator enters its `triggerState` — same role `AppHost.ts` already has for
 * `renderApi.showScreen`, just for animation instead of screen visibility.
 */
export function setupTheatreBridge(
  orchestrator: AppOrchestrator,
  applyAnimatedValue: (id: string, value: number) => void,
): void {
  initStudio()

  const project = getProject('GameUI')

  for (const scenario of scenarios) {
    const sheet = project.sheet(scenario.sheetName)
    for (const object of scenario.objects) {
      const theatreObject = sheet.object(object.objectKey, buildProps(object))
      theatreObject.onValuesChange(values => {
        for (const [prop, value] of Object.entries(values)) applyAnimatedValue(`${object.objectKey}.${prop}`, value)
      })
    }
  }

  orchestrator.subscribe(snapshot => {
    const scenario = scenarios.find(s => s.triggerState === snapshot.value)
    if (scenario) project.sheet(scenario.sheetName).sequence.play()
  })
}
