import { Container } from 'pixi.js'

/**
 * Composition over inheritance: subclasses own a `.node` (the actual Pixi object added to the
 * scene graph) rather than being one themselves. Keeps each component's public surface to what
 * makes sense for it, instead of inheriting the entire `Container` API.
 */
export abstract class UIComponent {
  abstract readonly node: Container

  onClick?: () => void
  onHover?: (isOver: boolean) => void

  private _interactive = false
  private _wired = false

  /** `eventMode = 'none'` by default — saves hit-testing until something actually listens. */
  get interactive(): boolean { return this._interactive }
  set interactive(value: boolean) {
    this._interactive = value
    this.node.eventMode = value ? 'static' : 'none'
    this.node.cursor    = value ? 'pointer' : undefined
    if (value) this._wireEvents()
  }

  // Hit-testing relies on Pixi's automatic bounds for now — sufficient for rectangular
  // text/buttons. If custom shapes/masks show up later, reintroduce an explicit hitArea here,
  // recomputed via a dirty flag after each Yoga layout pass (not at construction — @pixi/layout
  // doesn't measure geometry synchronously, see the width:'auto' bug once hit on TextLabel).

  private _wireEvents(): void {
    if (this._wired) return
    this._wired = true
    this.node.on('pointertap',  () => this.onClick?.())
    this.node.on('pointerover', () => this.onHover?.(true))
    this.node.on('pointerout',  () => this.onHover?.(false))
  }
}
