import type { AnimationScenario } from './types';

export const titleScreenScenario: AnimationScenario = {
  sheetName: 'TitleScreen',
  fileName: 'title-screen',
  triggerState: 'TITLE_SCREEN',
  objects: [{ objectKey: 'title' }, { objectKey: 'connectController' }],
};
