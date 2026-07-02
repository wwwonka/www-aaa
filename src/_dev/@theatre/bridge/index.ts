import { getProject, types } from '@theatre/core'
import type { AppOrchestrator } from '../../../core/AppOrchestrator'
import { initStudio } from '../studio'
import { scenarios } from '../scenarios/_index'
import type { AnimationObject } from '../scenarios/types'

/**
 * Shared transform props every animatable object gets in Studio by default — mirrors
 * `UIComponent.registerAnimatable()`'s own set 1:1. Means a scenario never has to guess in advance
 * which property it'll end up keyframing: opacity, position, scale and rotation are all already
 * there, ready to scrub, without declaring anything per-object.
 */
const DEFAULT_TRANSFORM_PROPS = {
  opacity:  types.number(1, { range: [0, 1] }),
  x:        types.number(0, { range: [-2000, 2000] }),
  y:        types.number(0, { range: [-2000, 2000] }),
  scaleX:   types.number(1, { range: [0, 4] }),
  scaleY:   types.number(1, { range: [0, 4] }),
  rotation: types.number(0, { range: [-Math.PI, Math.PI] }),
}

/** Builds Theatre object props: the shared default set, overridden per-key by whatever a scenario explicitly declares. */
function buildProps(object: AnimationObject): Record<string, ReturnType<typeof types.number> | number> {
  const overrides = Object.fromEntries(
    Object.entries(object.defaults ?? {}).map(([key, value]) => {
      const range = object.ranges?.[key]
      return [key, range ? types.number(value, { range: [...range] }) : value]
    }),
  )
  return { ...DEFAULT_TRANSFORM_PROPS, ...overrides }
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
