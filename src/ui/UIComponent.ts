import { Container } from 'pixi.js'
import { registerAnimatable } from '../render/animation/AnimationRegistry'

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

  /**
   * Opts this component into the generic transform properties Theatre.js can animate — no need to
   * pre-decide which one you'll actually keyframe, they're all available in Studio from the start.
   * `x`/`y` may fight a Yoga-managed position on a flex child; verify empirically if used there.
   *
   * @param id - Registry namespace for this component (matches its Theatre object key) — each
   * prop is registered as `` `${id}.<prop>` `` (e.g. `'title.opacity'`).
   */
  protected registerAnimatable(id: string): void {
    registerAnimatable(`${id}.opacity`,  v => { this.node.alpha = v })
    registerAnimatable(`${id}.x`,        v => { this.node.x = v })
    registerAnimatable(`${id}.y`,        v => { this.node.y = v })
    registerAnimatable(`${id}.scaleX`,   v => { this.node.scale.x = v })
    registerAnimatable(`${id}.scaleY`,   v => { this.node.scale.y = v })
    registerAnimatable(`${id}.rotation`, v => { this.node.rotation = v })
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
