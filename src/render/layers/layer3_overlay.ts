import { Container } from 'pixi.js'

/** System UI layer — menus, pause screen — drawn above the frozen-game layer. */
export function createOverlayUI(): Container {
  return new Container()
}
