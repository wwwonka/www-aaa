import { Container } from 'pixi.js';

/** Bottom-most PixiJS layer — in-game HUD, composited directly over Babylon's framebuffer. */
export function createGameUI(): Container {
  return new Container();
}
