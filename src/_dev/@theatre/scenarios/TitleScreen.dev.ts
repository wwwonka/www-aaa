import type { AnimationScenario } from './types'

export const titleScreenScenario: AnimationScenario = {
  sheetName:    'TitleScreen',
  triggerState: 'TITLE_SCREEN',
  objects: [
    { objectKey: 'title',             defaults: { opacity: 0 }, ranges: { opacity: [0, 1] } },
    { objectKey: 'connectController', defaults: { opacity: 0 }, ranges: { opacity: [0, 1] } },
  ],
}
