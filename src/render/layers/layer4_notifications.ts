import { Container } from 'pixi.js'

/** Top-most layer — toasts/notifications, always drawn last so they sit above everything else. */
export function createNotificationUI(): Container {
  return new Container()
}
